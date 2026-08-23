# Evaluating local models

Comparing two local models on the same task is easy to talk about and hard to do. Without a record of what was actually sent and what came back, every comparison turns into a memory of a comparison. A trace log is the cheapest way to turn an impression into evidence: model, full message list, response, latency, and whether the call failed.

The interesting number is rarely the average. A model that answers in two seconds nine times out of ten and stalls for a minute on the tenth feels slower than one that always takes five seconds.

Related: [[Prompt versions]], [[Latency and first token]]
