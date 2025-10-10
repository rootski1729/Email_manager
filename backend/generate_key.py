#!/usr/bin/env python
"""
Generate a new Fernet encryption key for token encryption
"""
from cryptography.fernet import Fernet

if __name__ == "__main__":
    key = Fernet.generate_key()
    print("🔑 Generated Fernet Encryption Key:")
    print(key.decode())
    print("\nAdd this to your .env file as ENCRYPTION_KEY")
