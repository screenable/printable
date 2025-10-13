// src/helpers/voucher-helper.ts
import axios, { type AxiosInstance } from 'axios';

export interface VoucherResponse {
  code?: string;
  category?: string;
  [key: string]: unknown;
}

export class VoucherHelper {
  private voucherApi: AxiosInstance;

  constructor(baseURL: string, apiKey: string) {
    this.voucherApi = axios.create({
      baseURL: baseURL,
      timeout: 5000,
      headers: { 'X-API-KEY': apiKey },
    });
  }

  /**
   * Fetches a valid voucher code for a specific category from the API
   * @param category - The category identifier for the voucher
   * @returns The voucher code or null if request fails
   */
  async getVoucherCode(category: string): Promise<string | null> {
    try {
      const voucherResponse = await this.voucherApi.get<VoucherResponse>(`/voucher-code/${category}`);
      
      if (voucherResponse.status === 200) {
        const { data } = voucherResponse;
        
        // Return the code from the response, or the entire data if it's a string
        if (typeof data === 'string') {
          return data;
        }
        
        return data.code || null;
      }
      
      console.error(`Failed to fetch voucher code for category ${category}: ${voucherResponse.status}`);
      return null;
    } catch (error) {
      console.error(`Error fetching voucher code for category ${category}:`, error);
      return null;
    }
  }

  /**
   * Fetches voucher codes for multiple categories
   * @param categories - Array of category identifiers
   * @returns Map of category to voucher code
   */
  async getVoucherCodes(categories: string[]): Promise<Map<string, string | null>> {
    const results = new Map<string, string | null>();
    
    const promises = categories.map(async (category) => {
      const code = await this.getVoucherCode(category);
      results.set(category, code);
    });

    await Promise.all(promises);
    return results;
  }
}
