
# HackClub Spaces

A simple web platform that allows users to create and host static websites and Python scripts. Built with Flask and PostgreSQL. Made by Ethan Canterbury and Hack Club ❤️

## We need YOU to contribute!

/templates/editor.html is VERY un-orginized and a bunch of useless stuff is in there, partially because I used the "Optimize" feature which fixed some things but turned my code into AI slop. D: **I Would GREATLY APPRECIATE if somebody took the time to sort it out into seperate files and orginize it a bit. That would mean the world to me. Make sure the editor stays versitile though so we can add hundreds of languages in the future!!**

## Features

- User authentication and management
- Create and host static websites
- Python script editor and execution (kinda-ish working maybe???)
- Real-time code editing 
- Automatic deployments
- Custom domain support
- Collaboration
- Club Management

## Setup

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
   (You may have some trouble with this, **you NEED a Postgres DB to do this.** If you run this command and still get errors / it doesnt work, you may need to add the tables manualy!)

6. Run the application:
   ```bash
   python main.py
   ```

The application will be available at `http://0.0.0.0:3000`.

## Database Schema

- **Users**: Stores user information and authentication details
- **Sites**: Stores website/script content and metadata

## Preview Code

Currently using 'iloveboba' as the preview code for new signups.

## License

This project is part of HackClub and follows HackClub's licensing terms.

## Contributing

We LOVE when people contribute to add new features and fix stuff! We do have a few guidelines though!

- You MAY use AI but DO NOT LET IT RE-WRITE OUR CODE / SLOPIFY IT!!
- Please make sure your changes are compatible with our Jinja templating & security measures.
- Dont mess up my routes (instant pr close)
- Test EVERYTHING before opening a PR please!
- Follow Hack Club's Code Of Conduct!!
- DM me, @ecanterbury on the Hack Club Slack with any questions but dont spam me or start telling me how bad my orginization and formatting is (I already know its horrendous) and its a privlage that this is public and was made, dont abuse it.

## Credit

A majority of this program was developed by Ethan Canterbury with the help of the following:

- Claude Sonnet 3.5 (SocketIO, Security, Some design factors, optimization)