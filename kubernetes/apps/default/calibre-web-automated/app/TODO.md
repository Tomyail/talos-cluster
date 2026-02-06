# TODO: Configure VolSync backup for 'calibre-web-automated-nfs' PVC
# The 'calibre-web-automated-nfs' PVC (now on local SSD/topolvm) needs to be backed up.
# Currently, the global VolSync template only backs up the primary 'calibre-web-automated' PVC.
# Adding a second ReplicationSource here is pending because the backup destination (NAS/NFS) is currently offline and in maintenance mode.
# Once NAS is restored:
# 1. Create a new ReplicationSource for 'calibre-web-automated-nfs'
# 2. Add a new ExternalSecret for its repository keys (or reuse if appropriate)
