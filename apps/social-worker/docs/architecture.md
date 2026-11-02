# Architecture

`api-edge` resolves the session and forwards the request with `x-actor-subject-id`. Social tables key on the person, never on an organization. A person has no social access until they own a profile, and creating one consumes a valid invite in the same D1 batch.
