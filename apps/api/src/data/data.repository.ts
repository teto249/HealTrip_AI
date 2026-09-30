import { Injectable } from "@nestjs/common";

import specialtiesSeed from "./seed/specialties.json";
import facilitiesSeed from "./seed/facilities.json";
import providersSeed from "./seed/providers.json";
import symptomSpecialtyMapSeed from "./seed/symptomSpecialtyMap.json";
import pathwayContentSeed from "./seed/pathwayContent.json";

export interface SpecialtyRow {
  id: string;
  name: string;
  description: string;
}

export interface FacilityRow {
  id: string;
  name: string;
  city: string;
  country: string;
  address: string;
  hasEmergencyDepartment: boolean;
}

export interface ProviderRow {
  id: string;
  name: string;
  specialtyId: string;
  facilityId: string;
  feeAmount: number;
  feeCurrency: string;
  languages: string[];
  telehealth: boolean;
  bio: string;
}

export interface ProviderWithFacility extends ProviderRow {
  facility: FacilityRow;
  specialty: SpecialtyRow;
}

export interface SymptomSpecialtyMapRow {
  symptomKeyword: string;
  specialtyId: string;
  weight: number;
}

export interface PathwayContentRow {
  key: string;
  bodyEn: string;
  bodyAr: string;
}

export interface ProviderSearchFilters {
  specialtyId?: string;
  city?: string;
  telehealthOnly?: boolean;
  maxFeeUsd?: number;
  language?: string;
}

export interface RankedSpecialty {
  specialty: SpecialtyRow;
  score: number;
  matchedKeywords: string[];
}

@Injectable()
export class DataRepository {
  private readonly specialties: SpecialtyRow[] = specialtiesSeed;
  private readonly facilities: FacilityRow[] = facilitiesSeed;
  private readonly providers: ProviderRow[] = providersSeed;
  private readonly symptomMap: SymptomSpecialtyMapRow[] = symptomSpecialtyMapSeed;
  private readonly pathwayContent: PathwayContentRow[] = pathwayContentSeed;

  listSpecialties(): SpecialtyRow[] {
    return this.specialties;
  }

  getSpecialtyById(id: string): SpecialtyRow | undefined {
    return this.specialties.find((s) => s.id === id);
  }

  getFacilityById(id: string): FacilityRow | undefined {
    return this.facilities.find((f) => f.id === id);
  }

  private hydrate(provider: ProviderRow): ProviderWithFacility | undefined {
    const facility = this.getFacilityById(provider.facilityId);
    const specialty = this.getSpecialtyById(provider.specialtyId);
    if (!facility || !specialty) return undefined;
    return { ...provider, facility, specialty };
  }

  getProviderById(id: string): ProviderWithFacility | undefined {
    const provider = this.providers.find((p) => p.id === id);
    return provider ? this.hydrate(provider) : undefined;
  }

  searchProviders(filters: ProviderSearchFilters): ProviderWithFacility[] {
    return this.providers
      .filter((p) => !filters.specialtyId || p.specialtyId === filters.specialtyId)
      .filter((p) => !filters.telehealthOnly || p.telehealth)
      .filter((p) => filters.maxFeeUsd === undefined || p.feeAmount <= filters.maxFeeUsd)
      .filter((p) => !filters.language || p.languages.includes(filters.language))
      .map((p) => this.hydrate(p))
      .filter((p): p is ProviderWithFacility => {
        if (!p) return false;
        if (filters.city && p.facility.city.toLowerCase() !== filters.city.toLowerCase()) return false;
        return true;
      });
  }

  findEmergencyFacilities(city?: string): FacilityRow[] {
    const emergencyCapable = this.facilities.filter((f) => f.hasEmergencyDepartment);
    if (!city) return emergencyCapable;
    const lower = city.toLowerCase();
    return [...emergencyCapable].sort((a, b) => {
      const aMatch = a.city.toLowerCase() === lower ? 0 : 1;
      const bMatch = b.city.toLowerCase() === lower ? 0 : 1;
      return aMatch - bMatch;
    });
  }

  mapSymptomsToSpecialties(symptoms: string[]): RankedSpecialty[] {
    const scores = new Map<string, { score: number; matched: Set<string> }>();
    const haystacks = symptoms.map((s) => s.toLowerCase()).filter(Boolean);

    for (const row of this.symptomMap) {
      const keyword = row.symptomKeyword.toLowerCase();
      const matchedInThisCase = haystacks.some((h) => h.includes(keyword));
      if (!matchedInThisCase) continue;

      const existing = scores.get(row.specialtyId) ?? { score: 0, matched: new Set<string>() };
      existing.score += row.weight;
      existing.matched.add(row.symptomKeyword);
      scores.set(row.specialtyId, existing);
    }

    return [...scores.entries()]
      .map(([specialtyId, { score, matched }]) => {
        const specialty = this.getSpecialtyById(specialtyId);
        if (!specialty) return undefined;
        return { specialty, score: Math.round(score * 100) / 100, matchedKeywords: [...matched] };
      })
      .filter((r): r is RankedSpecialty => Boolean(r))
      .sort((a, b) => b.score - a.score);
  }

  getPathwayContent(key: string): PathwayContentRow | undefined {
    return this.pathwayContent.find((p) => p.key === key);
  }
}
