
# Hack Club Spaces & Club Dashboard

A simple web platform that allows users to create, test and host static websites and Python scripts. Built with Python Flask and PostgreSQL. Made by Ethan Canterbury and Hack Club ❤️

## Features

- User authentication and management
- Create and host static websites
- Python script editor and execution
- Real-time code editing
- Automatic deployments
- Custom domain support
- HCB Integration
- Hackatime Integration

## Setup (Selfhosting Spaces!!)

1. Clone this project and create a new `.env` file:
   ```bash
   cp .env.example .env
   ```

2. Update the `.env` file with your database credentials and secret key.

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Initialize the database:
   ```bash
   python setup_db.py
   ```

5. Run the application:
   ```bash
   python main.py
   ```

The application will be available at `http://0.0.0.0:3000`.

## Database Schema

- **Users**: Stores user information and authentication details
- **Sites**: Stores website/script content and metadata

## VERY IMPORTANT!!!

You MUST have a db created with the correct tables or it will NOT work!! If even the tiniest table is formatted wrong, it will not start!
## License

This project is part of HackClub and follows HackClub's licensing terms. Contributing and socializing on this project is subject to the Hack Club Code of Conduct

For support, create an issue or go to #spaces on slack! Need private help? @ecanterbury. Club help? @jps

## Management 

This project is managed and lead by Ethan Canterbury
