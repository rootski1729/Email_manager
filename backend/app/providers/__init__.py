from app.models import Provider
from app.providers.base import MailProvider
from app.providers.gmail import GmailProvider
from app.providers.imap import ImapProvider

_PROVIDERS: dict[Provider, MailProvider] = {
    Provider.gmail: GmailProvider(),
    Provider.imap: ImapProvider(),
}


def get_provider(provider: Provider) -> MailProvider:
    return _PROVIDERS[provider]


def set_provider(provider: Provider, impl: MailProvider) -> None:
    """Swap a provider implementation (tests)."""
    _PROVIDERS[provider] = impl
