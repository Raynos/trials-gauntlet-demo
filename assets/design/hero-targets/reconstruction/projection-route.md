# Projection route decision

Required for maximum visible reference likeness. Inputs and official helper outputs: camera-initial.json, delit.png/delit-report.json, projection-plan.json. Initial camera is not calibrated; all agent guesses retain agentFill=true. Descriptor targets head with palette continuation for unseen surfaces (confidence0.3). Additional cloth projection descriptors can be produced only after correct cloth UV/pose exists. The source contains an environment, so runtime sampling must use a verified subject/region mask and visibility/depth rejection, never paint background onto the character. Current de-lit candidate retains shadows and requires further review before material-pass acceptance.

This records the chosen route and preparatory helper execution, not an actual texture bake. Runtime fitting, sampling, UV bake, occlusion coverage and relighting remain build/material gates.
