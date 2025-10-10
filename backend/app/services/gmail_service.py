"""
Google OAuth service for Gmail integration
"""
import base64
import logging
import warnings
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from google.auth.transport.requests import Request
import httpx  # For manual token exchange
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.config import settings
from app.core.security import token_encryption
from app.models import ConnectedEmail, User

logger = logging.getLogger(__name__)


class GoogleOAuthService:
    """Handle Google OAuth and Gmail API interactions"""
    
    SCOPES = [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.modify',
        'https://mail.google.com/',
        'https://www.googleapis.com/auth/userinfo.email',
    ]
    
    @staticmethod
    def get_auth_url(state: str = None) -> str:
        """Generate Google OAuth authorization URL"""
        flow = Flow.from_client_config(
            {
                "web": {
                    "client_id": settings.GOOGLE_CLIENT_ID,
                    "client_secret": settings.GOOGLE_CLIENT_SECRET,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "redirect_uris": [settings.GOOGLE_REDIRECT_URI],
                }
            },
            scopes=GoogleOAuthService.SCOPES,
            redirect_uri=settings.GOOGLE_REDIRECT_URI
        )
        
        auth_url, _ = flow.authorization_url(
            access_type='offline',
            include_granted_scopes='true',
            prompt='consent',
            state=state
        )
        
        return auth_url
    
    @staticmethod
    def exchange_code_for_tokens(code: str) -> Dict[str, Any]:
        """Exchange authorization code for access and refresh tokens"""
        try:
            logger.info("📧 Exchanging OAuth code for tokens...")
            
            # 🔧 Manually exchange code for tokens to avoid scope order validation
            # The google-auth-oauthlib library raises a Warning exception when Google
            # returns scopes in different order, even though they're identical.
            # We bypass this by calling Google's token endpoint directly.
            
            with httpx.Client() as client:
                token_response = client.post(
                    'https://oauth2.googleapis.com/token',
                    data={
                        'code': code,
                        'client_id': settings.GOOGLE_CLIENT_ID,
                        'client_secret': settings.GOOGLE_CLIENT_SECRET,
                        'redirect_uri': settings.GOOGLE_REDIRECT_URI,
                        'grant_type': 'authorization_code',
                    }
                )
            
            if token_response.status_code != 200:
                logger.error(f"❌ Token exchange failed: {token_response.text}")
                raise Exception(f"Token exchange failed: {token_response.text}")
            
            token_data = token_response.json()
            
            logger.info(f"✅ OAuth tokens received successfully")
            logger.info(f"✅ Granted scopes: {token_data.get('scope', 'N/A')}")

            return {
                'access_token': token_data['access_token'],
                'refresh_token': token_data.get('refresh_token'),  # May not always be present
                'expires_in': token_data.get('expires_in', 3600),
                'token_uri': 'https://oauth2.googleapis.com/token',
                'client_id': settings.GOOGLE_CLIENT_ID,
                'client_secret': settings.GOOGLE_CLIENT_SECRET,
                'scopes': token_data.get('scope', '').split(),  # Scopes as list
            }

        except Exception as e:
            logger.error(f"❌ Failed to exchange OAuth code: {str(e)}")
            logger.error(f"   Error type: {type(e).__name__}")
            logger.error(f"   Code (first 20 chars): {code[:20]}...")
            raise Exception(f"Failed to exchange authorization code: {str(e)}")

    
    @staticmethod
    async def save_connected_email(
        db: AsyncSession,
        user_id: int,
        email_address: str,
        access_token: str,
        refresh_token: str,
        expires_in: int
    ) -> ConnectedEmail:
        """Save connected Gmail account"""
        # Encrypt tokens before storing
        encrypted_access = token_encryption.encrypt(access_token)
        encrypted_refresh = token_encryption.encrypt(refresh_token)
        
        # Check if email already connected
        stmt = select(ConnectedEmail).where(
            ConnectedEmail.user_id == user_id,
            ConnectedEmail.email_address == email_address
        )
        result = await db.execute(stmt)
        existing = result.scalar_one_or_none()
        
        if existing:
            # Update tokens
            existing.access_token_encrypted = encrypted_access
            existing.refresh_token_encrypted = encrypted_refresh
            existing.token_expires_at = datetime.utcnow() + timedelta(seconds=expires_in)
            existing.is_active = True
            await db.commit()
            await db.refresh(existing)
            return existing
        
        # Create new connection
        connected_email = ConnectedEmail(
            user_id=user_id,
            email_address=email_address,
            access_token_encrypted=encrypted_access,
            refresh_token_encrypted=encrypted_refresh,
            token_expires_at=datetime.utcnow() + timedelta(seconds=expires_in)
        )
        
        db.add(connected_email)
        await db.commit()
        await db.refresh(connected_email)
        
        # Setup Gmail push notification (Pub/Sub)
        await GoogleOAuthService.setup_gmail_push_notification(
            connected_email.id,
            access_token,
            email_address
        )
        
        return connected_email
    
    @staticmethod
    async def setup_gmail_push_notification(
        connected_email_id: int,
        access_token: str,
        email_address: str
    ):
        """Setup Gmail push notifications via Pub/Sub"""
        try:
            credentials = Credentials(token=access_token)
            service = build('gmail', 'v1', credentials=credentials)
            
            request_body = {
                'topicName': f'projects/{settings.GOOGLE_PROJECT_ID}/topics/{settings.GOOGLE_PUBSUB_TOPIC}',
                'labelIds': ['INBOX'],
            }
            
            response = service.users().watch(userId='me', body=request_body).execute()
            
            # Store historyId for incremental sync
            print(f"✅ Gmail push notification setup for {email_address}")
            print(f"   History ID: {response.get('historyId')}")
            
        except HttpError as error:
            print(f"❌ Failed to setup Gmail push notification: {error}")
    
    @staticmethod
    def get_credentials_from_connected_email(connected_email: ConnectedEmail) -> Credentials:
        """Create Google Credentials from ConnectedEmail"""
        access_token = token_encryption.decrypt(connected_email.access_token_encrypted)
        refresh_token = token_encryption.decrypt(connected_email.refresh_token_encrypted)
        
        return Credentials(
            token=access_token,
            refresh_token=refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=settings.GOOGLE_CLIENT_ID,
            client_secret=settings.GOOGLE_CLIENT_SECRET,
        )
    
    @staticmethod
    async def refresh_access_token(
        db: AsyncSession,
        connected_email: ConnectedEmail
    ) -> str:
        """Refresh expired access token"""
        credentials = GoogleOAuthService.get_credentials_from_connected_email(connected_email)
        
        # Refresh token
        credentials.refresh(Request())
        
        # Update in database
        connected_email.access_token_encrypted = token_encryption.encrypt(credentials.token)
        connected_email.token_expires_at = credentials.expiry
        await db.commit()
        
        return credentials.token
    
    @staticmethod
    def get_user_email_address(access_token: str) -> str:
        """Get user's Gmail address from access token"""
        try:
            logger.info("📧 Fetching user email address from Google...")
            credentials = Credentials(token=access_token)
            service = build('gmail', 'v1', credentials=credentials)
            
            profile = service.users().getProfile(userId='me').execute()
            email_address = profile['emailAddress']
            logger.info(f"✅ Retrieved email address: {email_address}")
            return email_address
        
        except HttpError as error:
            logger.error(f"❌ Failed to get email address: {error}")
            raise ValueError(f"Failed to get email address: {error}")
        except Exception as e:
            logger.error(f"❌ Unexpected error getting email: {str(e)}")
            raise ValueError(f"Failed to get email address: {str(e)}")
    
    @staticmethod
    async def fetch_email_metadata(
        connected_email: ConnectedEmail,
        message_id: str
    ) -> Dict[str, Any]:
        """Fetch email metadata from Gmail"""
        credentials = GoogleOAuthService.get_credentials_from_connected_email(connected_email)
        service = build('gmail', 'v1', credentials=credentials)
        
        try:
            message = service.users().messages().get(
                userId='me',
                id=message_id,
                format='metadata',
                metadataHeaders=['From', 'Subject', 'Date']
            ).execute()
            
            headers = {h['name']: h['value'] for h in message['payload']['headers']}
            
            return {
                'message_id': message['id'],
                'thread_id': message['threadId'],
                'snippet': message.get('snippet', ''),
                'sender': headers.get('From', ''),
                'subject': headers.get('Subject', ''),
                'date': headers.get('Date', ''),
                'internal_date': message.get('internalDate', ''),
            }
        
        except HttpError as error:
            print(f"❌ Failed to fetch email: {error}")
            return None
    
    @staticmethod
    async def fetch_email_body(
        connected_email: ConnectedEmail,
        message_id: str
    ) -> Optional[str]:
        """Fetch full email body"""
        credentials = GoogleOAuthService.get_credentials_from_connected_email(connected_email)
        service = build('gmail', 'v1', credentials=credentials)
        
        try:
            message = service.users().messages().get(
                userId='me',
                id=message_id,
                format='full'
            ).execute()
            
            # Extract body (simplified - handle multipart later)
            payload = message['payload']
            
            if 'parts' in payload:
                # Multipart message
                for part in payload['parts']:
                    if part['mimeType'] == 'text/plain':
                        data = part['body'].get('data', '')
                        if data:
                            return base64.urlsafe_b64decode(data).decode('utf-8', errors='ignore')
            else:
                # Simple message
                data = payload['body'].get('data', '')
                if data:
                    return base64.urlsafe_b64decode(data).decode('utf-8', errors='ignore')
            
            return message.get('snippet', '')
        
        except HttpError as error:
            print(f"❌ Failed to fetch email body: {error}")
            return None


# Needed for token refresh
from google.auth.transport.requests import Request
