# TODO: Re-enable Thanos components once NAS/MinIO is back online
# The following components were scaled down/disabled because they rely on the object store (MinIO on NAS):
# - storegateway (replicaCount: 0)
# - compactor (enabled: false)
# - bucketweb (replicaCount: 0)
