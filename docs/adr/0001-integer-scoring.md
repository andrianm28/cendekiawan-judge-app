# 1. Compute finals in integers

Final = 0.5 × C1 + 0.5 × C2 lands exactly on .5 for 12.5% of score combinations, and floating-point math rounds 789 of the 262,144 combinations the wrong way. We compute 8 × Final = 20 (D1+…+D5) + 35 V1 + 25 V2 + 20 V3 + 20 V4 and round half-up as (N + 4) div 8. Multi-judge finals average the unrounded values and round once, as in the ToT UM rubric. A test checks every combination.
