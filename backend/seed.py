# seed.py
import logging
from app import create_app, db # Import your app factory and db object
from models import User, RoleEnum # Import necessary models

# Configure logging for the script
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def seed_data():
    """Seeds initial data, like the admin user."""
    app = create_app() # Create an app instance to work within the app context
    with app.app_context():
        logging.info("--- Starting Database Seeding ---")

        # --- Admin User ---
        admin_username = 'admin'
        admin_password = 'ilovecapstone' # CHANGE THIS!

        existing_admin = User.query.filter_by(username=admin_username).first()
        if existing_admin:
            logging.info(f"Admin user '{admin_username}' already exists. Skipping creation.")
        else:
            try:
                admin_user = User(username=admin_username, role=RoleEnum.ADMIN)
                admin_user.set_password(admin_password)
                db.session.add(admin_user)
                db.session.commit()
                logging.info(f"Admin user '{admin_username}' created successfully.")
            except Exception as e:
                db.session.rollback()
                logging.error(f"Error creating admin user: {e}", exc_info=True)

        # --- Add other seed data here if needed (e.g., default groups) ---
        # try:
        #     group_a = UserGroup(name='Default Group A')
        #     db.session.add(group_a)
        #     db.session.commit()
        #     logging.info("Created Default Group A")
        # except IntegrityError: # Handle if group already exists
        #     db.session.rollback()
        #     logging.info("Default Group A already exists.")
        # except Exception as e:
        #     db.session.rollback()
        #     logging.error(f"Error creating default group: {e}", exc_info=True)


        logging.info("--- Database Seeding Complete ---")

if __name__ == '__main__':
    seed_data()