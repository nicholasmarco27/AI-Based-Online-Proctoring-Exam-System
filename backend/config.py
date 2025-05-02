# backend/config.py
import os
from datetime import timedelta
from dotenv import load_dotenv # Import dotenv

# Load environment variables from .env file (especially for local development)
load_dotenv()

basedir = os.path.abspath(os.path.dirname(__file__))

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'change-this-in-production-to-a-strong-secret'
    JWT_EXPIRATION_DELTA = timedelta(hours=1) # Token expiry time
    DB_USER = os.environ.get("DB_USER") # e.g., 'myapp_user'
    DB_PASS = os.environ.get("DB_PASS") # e.g., 'your_database_password'
    DB_NAME = os.environ.get("DB_NAME") # e.g., 'capstone' or 'myapp_production'
    INSTANCE_CONNECTION_NAME = os.environ.get("INSTANCE_CONNECTION_NAME")

    SQLALCHEMY_TRACK_MODIFICATIONS = False