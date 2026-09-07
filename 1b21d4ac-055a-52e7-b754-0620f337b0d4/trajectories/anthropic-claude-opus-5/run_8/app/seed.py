"""Entry point for the container's start-up seed. Idempotent."""
from app import run_seed

if __name__ == "__main__":
    run_seed()
