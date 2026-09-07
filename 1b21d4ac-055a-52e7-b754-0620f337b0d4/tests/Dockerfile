FROM deku-verifier-base:0.22.0

RUN pip install --no-cache-dir "headroom-ai>=0.24,<0.25"

COPY workflows.yaml rubric.json if_constraints.json instruction.md conftest.py test_roster.py test.sh code_rubric.json /tests/

WORKDIR /tests
