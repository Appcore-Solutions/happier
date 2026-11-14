import {
    isRecoveredHistoryTranscriptObservationProvenance,
    type SessionMessageDeliveryResolutionV1,
    type SessionTranscriptObservationProvenanceV1,
} from '@happier-dev/protocol';

/**
 * Server-owned row facts carried from a transcript row to its rendered message, independent of the
 * (possibly encrypted) content.
 */
export type TranscriptObservationMetadata = {
    sourceCreatedAt?: number;
    sourceUpdatedAt?: number;
    transcriptObservationProvenance?: SessionTranscriptObservationProvenanceV1;
    deliveryResolution?: SessionMessageDeliveryResolutionV1;
    /** Server-stamped Account that submitted a user prompt; absent for other rows and older servers. */
    authorAccountId?: string;
};

export function applyTranscriptObservationMetadata(
    target: TranscriptObservationMetadata,
    source: Readonly<TranscriptObservationMetadata> | null | undefined,
): void {
    if (source?.sourceCreatedAt !== undefined) {
        target.sourceCreatedAt = source.sourceCreatedAt;
    }
    if (source?.sourceUpdatedAt !== undefined) {
        target.sourceUpdatedAt = source.sourceUpdatedAt;
    }
    if (source?.transcriptObservationProvenance !== undefined) {
        target.transcriptObservationProvenance = source.transcriptObservationProvenance;
    }
    if (source?.deliveryResolution !== undefined) {
        target.deliveryResolution = source.deliveryResolution;
    }
    if (source?.authorAccountId !== undefined) {
        target.authorAccountId = source.authorAccountId;
    }
}

export function readTranscriptObservationMetadata(
    source: Readonly<TranscriptObservationMetadata>,
): TranscriptObservationMetadata {
    const metadata: TranscriptObservationMetadata = {};
    applyTranscriptObservationMetadata(metadata, source);
    return metadata;
}

export function isRecoveredHistoryTranscriptObservation(
    message: Readonly<Pick<TranscriptObservationMetadata, 'transcriptObservationProvenance'>> | null | undefined,
): boolean {
    return isRecoveredHistoryTranscriptObservationProvenance(message?.transcriptObservationProvenance);
}
