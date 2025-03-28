
from app import app, socketio 
from flask import jsonify, request
from flask_socketio import disconnect, leave_room, rooms, join_room

sid_to_user_id = {}
user_to_sids = {} 
room_members = {}

def initialize_database():
    """Placeholder for database initialization."""
    print("Database initialized (placeholder).")
    pass

@app.route('/')
def health_check():
    return jsonify({'status': 'ok'}), 200

if __name__ == '__main__':
    try:
        initialize_database()
    except Exception as e:
        app.logger.warning(f"Database initialization error: {e}")
    socketio.run(app, 
                host='0.0.0.0', 
                port=3000,
                allow_unsafe_werkzeug=True)

@socketio.on('disconnect')
def handle_disconnect():
    print(f'Client disconnected: {request.sid}')
    
    global sid_to_user_id, user_to_sids, room_members, rooms
    
    user_id = sid_to_user_id.pop(request.sid, None)
    if user_id and user_id in user_to_sids:
        user_to_sids[user_id].discard(request.sid)
        if not user_to_sids[user_id]:
            del user_to_sids[user_id]
    
    my_rooms = rooms(sid=request.sid)
    for room in my_rooms:
        leave_room(room)
        if room in room_members:
            room_members[room].discard(request.sid)
            if not room_members[room]:
                del room_members[room]
