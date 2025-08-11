from datetime import datetime
from ..extensions import db

# Re-export db for convenience in model modules
__all__ = ["db", "datetime"]
