import os
import requests
import json
from datetime import datetime

class AirtableService:
    def __init__(self):
        self.api_token = os.environ.get('AIRTABLE_TOKEN')
        self.base_id = 'appSnnIu0BhjI3E1p'
        self.table_name = 'YSWS Project Submission'  # Update to use the actual table name
        self.headers = {
            'Authorization': f'Bearer {self.api_token}',
            'Content-Type': 'application/json'
        }
        # Use URL-encoded table name for spaces
        self.base_url = f'https://api.airtable.com/v0/{self.base_id}/{self.table_name.replace(" ", "%20")}'

    def list_tables(self):
        """List all tables in the base to help with troubleshooting"""
        if not self.api_token:
            print("Warning: AIRTABLE_TOKEN environment variable is not set")
            return None

        try:
            base_url = f"https://api.airtable.com/v0/meta/bases/{self.base_id}/tables"
            response = requests.get(
                base_url,
                headers=self.headers
            )

            if response.status_code == 200:
                tables = response.json().get('tables', [])
                table_names = [table.get('name') for table in tables]
                print(f"Available tables in base {self.base_id}: {table_names}")
                return table_names
            else:
                print(f"Error listing tables: {response.status_code} - {response.text}")
                return None

        except Exception as e:
            print(f"Exception when listing tables: {str(e)}")
            return None

    def list_fields(self):
        """List fields in the table to help with troubleshooting"""
        if not self.api_token:
            print("Warning: AIRTABLE_TOKEN environment variable is not set")
            return None

        try:
            base_url = f"https://api.airtable.com/v0/meta/bases/{self.base_id}/tables"
            response = requests.get(
                base_url,
                headers=self.headers
            )

            if response.status_code == 200:
                tables = response.json().get('tables', [])
                for table in tables:
                    if table.get('name') == self.table_name:
                        fields = table.get('fields', [])
                        field_names = [field.get('name') for field in fields]
                        print(f"Available fields in table {self.table_name}: {field_names}")
                        return field_names
                return None
            else:
                print(f"Error listing fields: {response.status_code} - {response.text}")
                return None

        except Exception as e:
            print(f"Exception when listing fields: {str(e)}")
            return None

    def log_pizza_grant(self, submission_data):
        """Log a pizza grant submission to Airtable"""
        if not self.api_token:
            print("Warning: AIRTABLE_TOKEN environment variable is not set")
            return None
            
        # Fix screenshot URL format if it exists
        if 'screenshot' in submission_data and isinstance(submission_data['screenshot'], list):
            # Check if the screenshot has nested URL format
            if isinstance(submission_data['screenshot'][0], dict) and 'url' in submission_data['screenshot'][0]:
                url_value = submission_data['screenshot'][0]['url']
                # If URL is a list with dict, extract the actual URL string
                if isinstance(url_value, list) and len(url_value) > 0 and isinstance(url_value[0], dict) and 'url' in url_value[0]:
                    # Correct format: [{"url": "https://..."}]
                    submission_data['screenshot'] = [{"url": url_value[0]['url']}]

        # Try to list tables first to validate access and see available tables
        tables = self.list_tables()

        # List fields to help troubleshoot
        fields_list = self.list_fields()

        # Format address for readability
        address = submission_data.get('shipping_address', {})

        # Format data for Airtable - adjusted for YSWS Project Submission table
        # These fields should match exactly what's in your Airtable
        fields = {
            'Hackatime Project': submission_data.get('project_name'),
            'First Name': submission_data.get('first_name', ''),
            'Last Name': submission_data.get('last_name', ''),
            'GitHub Username': submission_data.get('username'),
            'Email': submission_data.get('email', ''),
            'Leader Email': submission_data.get('leader_email', ''),
            'Description': submission_data.get('project_description'),
            'Code URL': submission_data.get('github_url'),
            'Playable URL': submission_data.get('live_url'),
            'Screenshot': submission_data.get('screenshot'),
            'What are we doing well?': submission_data.get('doing_well', ''),
            'How can we improve?': submission_data.get('improve', ''),
            'How did you hear about this?': 'Hack Club Spaces Pizza Grants',
            'Club Name': submission_data.get('club_name', 'Unknown Club'),
            'Hours': str(float(submission_data.get('project_hours', 0))),
            'Grant Amount': f"${submission_data.get('grant_amount', 0)}",
            'Address (Line 1)': address.get('address1', ''),
            'Address (Line 2)': address.get('address2', ''),
            'City': address.get('city', ''),
            'State / Province': address.get('state', ''),
            'ZIP / Postal Code': address.get('zip', ''),
            'Country': address.get('country', ''),
            'Optional - Override Hours Spent': float(submission_data.get('project_hours', 0)),
            'Optional - Override Hours Spent Justification': 'Tracked via Hackatime',
            'Birthday': submission_data.get('birthday', '')
        }

        # Remove any empty fields
        fields = {k: v for k, v in fields.items() if v}

        payload = {
            'records': [
                {
                    'fields': fields
                }
            ]
        }

        try:
            # Send request to Airtable
            response = requests.post(
                self.base_url,
                headers=self.headers,
                json=payload
            )

            if response.status_code == 200 or response.status_code == 201:
                print(f"Successfully logged to Airtable table: {self.table_name}")
                return response.json()
            else:
                print(f"Error logging to Airtable: {response.status_code} - {response.text}")
                print(f"Payload sent: {json.dumps(payload)}")
                return None

        except Exception as e:
            print(f"Exception when logging to Airtable: {str(e)}")
            return None

# Singleton instance
airtable_service = AirtableService()