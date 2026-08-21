/**
 * Destination artwork. Tiers are catalogue-driven, so an unknown destination
 * has to degrade gracefully — it keeps the navy card, it just has no photo.
 */
export interface DestinationArt { image: string; alt: string; place: string }

const ART: Record<string, DestinationArt> = {
  Thailand: {
    image: '/brand/destinations/thailand.webp',
    alt: 'Wat Arun lit gold at dusk on the Chao Phraya river in Bangkok',
    place: 'Bangkok · Wat Arun',
  },
  Malaysia: {
    image: '/brand/destinations/malaysia.webp',
    alt: 'The Petronas Towers above the Kuala Lumpur skyline at blue hour',
    place: 'Kuala Lumpur · Petronas Towers',
  },
  Dubai: {
    image: '/brand/destinations/dubai.webp',
    alt: 'The Burj Khalifa rising over the Dubai skyline at night',
    place: 'Dubai · Burj Khalifa',
  },
  Singapore: {
    image: '/brand/destinations/singapore.webp',
    alt: 'Marina Bay Sands and the ArtScience Museum reflected in Marina Bay',
    place: 'Marina Bay · Singapore',
  },
  Europe: {
    image: '/brand/destinations/europe.webp',
    alt: 'The Palace of Westminster and Big Ben at sunset over the Thames',
    place: 'Grand tour · Europe',
  },
};

export const artFor = (destination: string): DestinationArt | null => ART[destination] ?? null;
