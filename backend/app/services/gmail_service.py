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

    @staticmethod
    async def get_valid_access_token(
        db: AsyncSession,
        connected_email: ConnectedEmail
    ) -> str:
        """Get valid access token, refresh if expired"""
        # Check if token is expired or about to expire (5 min buffer)
        if connected_email.token_expires_at:
            buffer = timedelta(minutes=5)
            if datetime.utcnow() + buffer >= connected_email.token_expires_at:
                logger.info(f"🔄 Access token expired, refreshing for {connected_email.email_address}")
                return await GoogleOAuthService.refresh_access_token(db, connected_email)
        
        # Token is still valid
        return token_encryption.decrypt(connected_email.access_token_encrypted)
    
    @staticmethod
    async def list_emails_from_inbox(
        db: AsyncSession,
        connected_email: ConnectedEmail,
        max_results: int = 20,
        page_token: Optional[str] = None,
        query: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Fetch emails from Gmail inbox with pagination
        
        Args:
            db: Database session
            connected_email: Connected email account
            max_results: Number of emails to fetch (max 500)
            page_token: Token for pagination
            query: Gmail search query (e.g., 'is:unread', 'from:example.com')
        
        Returns:
            Dict with messages and nextPageToken
        """
        try:
            # Get valid access token (auto-refresh if needed)
            access_token = await GoogleOAuthService.get_valid_access_token(db, connected_email)
            
            credentials = Credentials(token=access_token)
            service = build('gmail', 'v1', credentials=credentials)
            
            # Build request parameters
            params = {
                'userId': 'me',
                'maxResults': min(max_results, 500),  # Gmail API limit
            }
            
            if page_token:
                params['pageToken'] = page_token
            
            if query:
                params['q'] = query
            
            # Fetch message list
            logger.info(f"📥 Fetching emails from {connected_email.email_address}")
            response = service.users().messages().list(**params).execute()
            
            messages = response.get('messages', [])
            next_page_token = response.get('nextPageToken')
            
            # Fetch metadata for each message
            email_list = []
            for msg in messages:
                msg_detail = service.users().messages().get(
                    userId='me',
                    id=msg['id'],
                    format='metadata',
                    metadataHeaders=['From', 'Subject', 'Date', 'To']
                ).execute()
                
                headers = {h['name']: h['value'] for h in msg_detail['payload']['headers']}
                
                email_list.append({
                    'id': msg_detail['id'],
                    'threadId': msg_detail['threadId'],
                    'snippet': msg_detail.get('snippet', ''),
                    'from': headers.get('From', ''),
                    'to': headers.get('To', ''),
                    'subject': headers.get('Subject', ''),
                    'date': headers.get('Date', ''),
                    'internalDate': msg_detail.get('internalDate', ''),
                    'labelIds': msg_detail.get('labelIds', []),
                })
            
            logger.info(f"✅ Fetched {len(email_list)} emails")
            
            return {
                'emails': email_list,
                'nextPageToken': next_page_token,
                'resultSizeEstimate': response.get('resultSizeEstimate', 0)
            }
        
        except HttpError as error:
            logger.error(f"❌ Failed to fetch emails: {error}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Failed to fetch emails from Gmail: {str(error)}"
            )
        except Exception as e:
            logger.error(f"❌ Unexpected error fetching emails: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to fetch emails: {str(e)}"
            )
    
    @staticmethod
    async def get_email_by_id(
        db: AsyncSession,
        connected_email: ConnectedEmail,
        message_id: str,
        format: str = 'full'
    ) -> Dict[str, Any]:
        """
        Get specific email by Gmail message ID
        
        Args:
            db: Database session
            connected_email: Connected email account
            message_id: Gmail message ID
            format: 'minimal', 'full', 'raw', 'metadata'
        
        Returns:
            Email details
        """
        try:
            # Get valid access token (auto-refresh if needed)
            access_token = await GoogleOAuthService.get_valid_access_token(db, connected_email)
            
            credentials = Credentials(token=access_token)
            service = build('gmail', 'v1', credentials=credentials)
            
            logger.info(f"📧 Fetching email {message_id} from {connected_email.email_address}")
            
            message = service.users().messages().get(
                userId='me',
                id=message_id,
                format=format
            ).execute()
            
            # Parse headers
            headers = {}
            if 'payload' in message and 'headers' in message['payload']:
                headers = {h['name']: h['value'] for h in message['payload']['headers']}
            
            # Extract body
            body = ''
            if format == 'full':
                payload = message.get('payload', {})
                
                if 'parts' in payload:
                    # Multipart message
                    for part in payload['parts']:
                        if part.get('mimeType') == 'text/plain':
                            data = part.get('body', {}).get('data', '')
                            if data:
                                body = base64.urlsafe_b64decode(data).decode('utf-8', errors='ignore')
                                break
                        elif part.get('mimeType') == 'text/html' and not body:
                            data = part.get('body', {}).get('data', '')
                            if data:
                                body = base64.urlsafe_b64decode(data).decode('utf-8', errors='ignore')
                else:
                    # Simple message
                    data = payload.get('body', {}).get('data', '')
                    if data:
                        body = base64.urlsafe_b64decode(data).decode('utf-8', errors='ignore')
            
            result = {
                'id': message['id'],
                'threadId': message['threadId'],
                'labelIds': message.get('labelIds', []),
                'snippet': message.get('snippet', ''),
                'internalDate': message.get('internalDate', ''),
                'from': headers.get('From', ''),
                'to': headers.get('To', ''),
                'cc': headers.get('Cc', ''),
                'bcc': headers.get('Bcc', ''),
                'subject': headers.get('Subject', ''),
                'date': headers.get('Date', ''),
                'body': body if format == 'full' else message.get('snippet', ''),
                'raw': message.get('raw') if format == 'raw' else None,
            }
            
            logger.info(f"✅ Fetched email: {headers.get('Subject', 'No subject')}")
            
            return result
        
        except HttpError as error:
            logger.error(f"❌ Failed to fetch email {message_id}: {error}")
            if error.resp.status == 404:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Email not found: {message_id}"
                )
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Failed to fetch email from Gmail: {str(error)}"
            )
        except Exception as e:
            logger.error(f"❌ Unexpected error fetching email: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to fetch email: {str(e)}"
            )


# Needed for token refresh and HTTP exceptions
from google.auth.transport.requests import Request
from fastapi import HTTPException, status

