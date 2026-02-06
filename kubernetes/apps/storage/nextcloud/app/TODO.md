# TODO: Configure VolSync backup for 'nextcloud-nfs' PVC
# The 'nextcloud-nfs' PVC (now on local SSD/topolvm) needs to be backed up.
# Currently, there is likely no backup for this volume.
# Once NAS is restored:
# 1. Create a VolSync ReplicationSource for 'nextcloud-nfs'.
# 2. Ensure data migration or restore from NAS if needed (since the new volume started empty).
