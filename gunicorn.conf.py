# Gunicorn configuration for debug logging
import os
import logging

def when_ready(server):
    """Called just after the server is started."""
    # Force debug mode for application loggers
    os.environ["DEBUG"] = "1"
    
    # Import and configure application logging
    from utils.config_utils import setup_logging
    setup_logging()
    
    # Force all application loggers to DEBUG level
    app_loggers = ['api', 'land', 'loc', 'llm', 'cfg', 'cache', 'img', 'root']
    for logger_name in app_loggers:
        logger = logging.getLogger(logger_name)
        logger.setLevel(logging.DEBUG)
        logger.handlers = []  # Clear any existing handlers
        # Add console handler that shows DEBUG messages
        handler = logging.StreamHandler()
        handler.setLevel(logging.DEBUG)
        formatter = logging.Formatter('%(name)s:%(levelname)s: %(message)s')
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        logger.propagate = False
    
    print("DEBUG: Application loggers configured for DEBUG level in gunicorn")

# Server socket
bind = "0.0.0.0:5000"
backlog = 2048

# Worker processes
workers = 1
worker_class = "sync"
worker_connections = 1000
timeout = 30
keepalive = 2

# Restart workers
max_requests = 1000
max_requests_jitter = 50
preload_app = False

# Logging - keep gunicorn at info level
loglevel = "info"
accesslog = "-"
errorlog = "-"
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s"'

# Auto-reload
reload = True

# Development settings
reuse_port = True