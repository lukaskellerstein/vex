import uuid


def generate_agent_id() -> str:
    """Generate a short 8-character hex agent ID."""
    return uuid.uuid4().hex[:8]
