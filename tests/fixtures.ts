// Shared raw-shape fixtures mirroring api.booli.se responses (see
// docs/BOOLI-API.md). Field names/shapes match the canonical wrappers.
import type { RawArea, RawProperty } from '../src/format.js';

export const LISTING: RawProperty = {
  booliId: 1579812,
  location: {
    address: { streetAddress: 'Alphyddevägen 15' },
    position: { latitude: 59.3, longitude: 18.15 },
    namedAreas: ['Alphyddan'],
    region: { municipalityName: 'Nacka', countyName: 'Stockholms län' },
  },
  listPrice: 2_395_000,
  rent: 3220,
  floor: 8,
  livingArea: 70,
  rooms: 3,
  constructionYear: 1965,
  objectType: 'Lägenhet',
  tenureForm: 'Bostadsrätt',
  published: '2024-01-10 01:09:34',
  source: { name: 'Svenska Hem', type: 'Broker', url: 'http://www.sehem.se/' },
  url: '/bostad/lagenhet/alphyddan/alphyddevagen+15/1579812',
};

export const SOLD: RawProperty = {
  booliId: 181051,
  location: {
    address: { streetAddress: 'Aprikosgatan 29' },
    position: { latitude: 59.36, longitude: 17.83 },
    namedAreas: ['Hässelby Strand'],
    region: { municipalityName: 'Stockholm', countyName: 'Stockholms län' },
  },
  listPrice: 1_695_000,
  soldPrice: 1_680_000,
  soldDate: '2012-11-06',
  rent: 4213,
  floor: 6,
  livingArea: 73,
  rooms: 3,
  constructionYear: 1957,
  objectType: 'Lägenhet',
  published: '2012-06-14 15:30:55',
  source: { name: 'Svensk Fastighetsförmedling', id: 713, type: 'Broker' },
  url: '/bostad/lagenhet/hasselby+strand/aprikosgatan+29/181051',
};

export const AREA: RawArea = {
  booliId: 76,
  name: 'Nacka',
  types: ['Kommun'],
  parentBooliId: 2,
  parentName: 'Stockholms län',
  parentTypes: ['Län'],
  fullName: 'Nacka, Stockholms Län',
};
