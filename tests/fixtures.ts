// Shared raw GraphQL-node fixtures mirroring www.booli.se/graphql (see
// docs/BOOLI-API.md). Field names/shapes were validated live.
import type {
  AreaSuggestion,
  RawListing,
  RawPropertyDetail,
  RawSoldProperty,
} from '../src/graphql.js';

export const LISTING: RawListing = {
  __typename: 'Listing',
  booliId: '6151864',
  objectType: 'Lägenhet',
  tenureForm: 'Bostadsrätt',
  streetAddress: 'Turbinvägen 5A',
  descriptiveAreaName: 'Järla Sjö',
  latitude: 59.3051,
  longitude: 18.1515,
  published: '2026-07-13 12:28:35',
  daysActive: 0,
  isNewConstruction: false,
  url: '/bostad/4370936',
  rooms: { raw: 2 },
  livingArea: { raw: 60 },
  rent: { raw: 4100 },
  floor: null,
  listPrice: { raw: 3_250_000, formatted: '3 250 000 kr' },
  listSqmPrice: { raw: 54_167 },
  location: {
    region: { municipalityName: 'Nacka', countyName: 'Stockholms län' },
    namedAreas: ['Järla Sjö'],
  },
};

export const PROJECT_NODE = { __typename: 'Project', id: '18601' };

export const SOLD: RawSoldProperty = {
  __typename: 'SoldProperty',
  booliId: '6100827',
  objectType: 'Villa',
  tenureForm: 'Äganderätt',
  streetAddress: 'Värmdövägen 201',
  descriptiveAreaName: 'Storängen',
  latitude: 59.3095,
  longitude: 18.1685,
  soldDate: '2026-07-13',
  daysActive: 75,
  url: '/bostad/2358472',
  soldPrice: { raw: 16_000_000, formatted: '16 000 000 kr' },
  soldSqmPrice: { raw: 46_921 },
  listPrice: { raw: 20_000_000 },
  soldPricePercentageDiff: { raw: -20 },
  rooms: { raw: 10 },
  livingArea: { raw: 341 },
  rent: null,
  floor: null,
  location: {
    region: { municipalityName: 'Nacka', countyName: 'Stockholms län' },
    namedAreas: ['Storängen'],
  },
};

export const DETAIL: RawPropertyDetail = {
  __typename: 'Listing',
  booliId: '6151864',
  residenceId: '4370936',
  objectType: 'Lägenhet',
  tenureForm: 'Bostadsrätt',
  streetAddress: 'Turbinvägen 5A',
  descriptiveAreaName: 'Järla Sjö',
  latitude: 59.3051,
  longitude: 18.1515,
  constructionYear: 2017,
  buildingFloors: null,
  url: '/bostad/4370936',
  rooms: { raw: 2 },
  livingArea: { raw: 60 },
  additionalArea: null,
  plotArea: null,
  rent: { raw: 4100 },
  operatingCost: { raw: 1084 },
  floor: null,
  published: '2026-07-13 12:28:35',
  isNewConstruction: false,
  biddingOpen: 0,
  upcomingSale: false,
  listingUrl: 'https://www.svenskfast.se/…/turbinvagen-5a/461226/',
  listPrice: { raw: 3_250_000, formatted: '3 250 000 kr' },
  listSqmPrice: { raw: 54_167 },
  listPricePercentageDiff: { raw: 5 },
  agency: { name: 'Fantastic Frank', url: 'https://www.booli.se/maklarbyra/fantastic-frank' },
  estimate: { price: { raw: 3_400_000 } },
  location: {
    region: { municipalityName: 'Nacka', countyName: 'Stockholms län' },
    namedAreas: ['Järla Sjö'],
  },
};

export const AREA: AreaSuggestion = { id: 76, displayName: 'Nacka kommun' };
