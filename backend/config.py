import os
from datetime import timedelta

# Use os.path.abspath to ensure the path is correct regardless of where you run the script
basedir = os.path.abspath(os.path.dirname(__file__))

class Config:
    # Generate a strong secret key in a real app!
    # You can generate one using: python -c 'import secrets; print(secrets.token_hex())'
    # Store it in a .env file for security
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'your-fallback-super-secret-key' # CHANGE THIS!
    SQLALCHEMY_DATABASE_URI = 'sqlite:///' + os.path.join(basedir, 'instance', 'database.db')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JWT_EXPIRATION_DELTA = timedelta(hours=1) # Token expiry time