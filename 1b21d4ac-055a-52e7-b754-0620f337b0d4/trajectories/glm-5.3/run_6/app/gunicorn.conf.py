import os

bind = "0.0.0.0:" + os.environ.get("PORT", "4173")
workers = int(os.environ.get("WEB_CONCURRENCY", "3"))
threads = 4
worker_class = "gthread"
accesslog = None
errorlog = "-"
preload_app = False
timeout = 120
