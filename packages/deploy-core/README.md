# @rntme-cli/deploy-core

Target-neutral project deployment planning for rntme.

This package accepts an already validated/composed project model and produces a
`ProjectDeploymentPlan`. It does not read raw blueprint folders, collect
secrets, call Dokploy, or run browser verification.
