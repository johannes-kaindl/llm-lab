# Trace log rollout

We want recordings from every plugin that talks to a local model, so that model and prompt changes can be compared against evidence instead of memory. Right now only one plugin reports anything at all.

The first consumer is wired up and writes one line per call. Rotation is in place, masking runs on every write. What is still open: no consumer can hand over its endpoint key yet, so exact key masking has nothing to compare against, and there is no way to exclude a folder from recording.

We decided to keep recordings inside the vault rather than in a central store, because "not installed" is a stronger promise than any settings toggle. We also decided against referencing traces from the dataset — a reference into a rotated file points nowhere after seven days, so entries are copied instead.

Next up is the shared API change that closes both gaps at once, while there is still exactly one consumer to migrate.
