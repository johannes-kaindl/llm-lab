# Keeping recordings small

Anything append-only grows until something removes the old end of it. Two limits are enough: an age in days and a hard cap on total size. The file being written to today is never a candidate for removal — emptying the log you are currently filling is a bug, not housekeeping.

Related: [[Where the data lives]]
