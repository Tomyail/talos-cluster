#!/usr/bin/env bash

REPLICATION_DESTINATION_NAME=$1
NAMESPACE="${2:-default}"
TIMEOUT_SECONDS="${3:-7200}" # Default to 2 hours timeout

if [[ -z "${REPLICATION_DESTINATION_NAME}" ]]; then
    echo "Error: ReplicationDestination name not specified."
    exit 1
fi

echo "Waiting for ReplicationDestination ${REPLICATION_DESTINATION_NAME} in namespace ${NAMESPACE} to complete..."

start_time=$(date +%s)

while true; do
    current_time=$(date +%s)
    elapsed_time=$((current_time - start_time))

    if [[ "${elapsed_time}" -gt "${TIMEOUT_SECONDS}" ]]; then
        echo "Timeout waiting for ReplicationDestination ${REPLICATION_DESTINATION_NAME} to complete."
        echo "Dumping ReplicationDestination YAML:"
        kubectl -n "${NAMESPACE}" get replicationdestination "${REPLICATION_DESTINATION_NAME}" -o yaml

        # Try to get logs from the mover pod
        MOVER_POD=$(kubectl -n "${NAMESPACE}" get pod -l "volsync.backube/replication-destination=${REPLICATION_DESTINATION_NAME},volsync.backube/mover-type=restore" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
        if [[ -n "${MOVER_POD}" ]]; then
          echo "Logs from mover pod ${MOVER_POD} (last 50 lines):"
          kubectl -n "${NAMESPACE}" logs "${MOVER_POD}" --tail=50
        else
          echo "Mover pod not found for ${REPLICATION_DESTINATION_NAME}."
        fi
        exit 1
    fi

    # Fetch the crucial status fields
    # For 'restore-once', the result of the last mover operation is key.
    latest_mover_result=$(kubectl -n "${NAMESPACE}" get replicationdestination "${REPLICATION_DESTINATION_NAME}" -o jsonpath='{.status.latestMoverStatus.result}' 2>/dev/null)

    # For debugging, let's also get the 'Synchronizing' condition details correctly
    synchronizing_condition_status=$(kubectl -n "${NAMESPACE}" get replicationdestination "${REPLICATION_DESTINATION_NAME}" -o jsonpath='{.status.conditions[?(@.type=="Synchronizing")].status}' 2>/dev/null)
    synchronizing_condition_reason=$(kubectl -n "${NAMESPACE}" get replicationdestination "${REPLICATION_DESTINATION_NAME}" -o jsonpath='{.status.conditions[?(@.type=="Synchronizing")].reason}' 2>/dev/null)
    last_sync_time_from_status=$(kubectl -n "${NAMESPACE}" get replicationdestination "${REPLICATION_DESTINATION_NAME}" -o jsonpath='{.status.lastSyncTime}' 2>/dev/null)

    echo "Current status: latestMoverResult='${latest_mover_result}', synchronizingConditionStatus='${synchronizing_condition_status}', synchronizingConditionReason='${synchronizing_condition_reason}', lastSyncTime='${last_sync_time_from_status}'"

    # Check for success based on the mover's result
    if [[ "${latest_mover_result}" == "Successful" ]]; then
        echo "ReplicationDestination ${REPLICATION_DESTINATION_NAME} completed successfully (mover reported 'Successful')."
        break
    fi

    # Check for failure based on the mover's result
    # Add other potential failure strings if VolSync uses them, e.g., "Error", "Unsuccessful"
    if [[ "${latest_mover_result}" == "Failed" ]]; then
        echo "ReplicationDestination ${REPLICATION_DESTINATION_NAME} failed (mover reported 'Failed')."
        echo "Dumping ReplicationDestination YAML:"
        kubectl -n "${NAMESPACE}" get replicationdestination "${REPLICATION_DESTINATION_NAME}" -o yaml
        MOVER_POD=$(kubectl -n "${NAMESPACE}" get pod -l "volsync.backube/replication-destination=${REPLICATION_DESTINATION_NAME},volsync.backube/mover-type=restore" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
        if [[ -n "${MOVER_POD}" ]]; then
          echo "Logs from mover pod ${MOVER_POD} (last 50 lines):"
          kubectl -n "${NAMESPACE}" logs "${MOVER_POD}" --tail=50
        else
            echo "Mover pod not found for ${REPLICATION_DESTINATION_NAME}."
        fi
        exit 1
    fi

    # If latest_mover_result is empty or neither "Successful" nor "Failed",
    # the operation is still in progress or hasn't reported its final status yet.
    # The 'Synchronizing' condition might indicate if VolSync is actively trying.
    # If synchronizing_condition_status is 'True', it's likely still working.
    # If it's 'False' with reason 'WaitingForManual' (as in your YAML after completion),
    # but latest_mover_result isn't 'Successful' yet, we should continue to wait for latest_mover_result.

    sleep 15 # Polling interval
done

exit 0
