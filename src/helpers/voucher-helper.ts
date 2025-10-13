// src/helpers/voucher-helper.ts

export interface VoucherResponse {
  code?: string;
  category?: string;
  [key: string]: unknown;
}

export class VoucherHelper {
  private baseURL: string;
  private apiKey: string;

  constructor(baseURL: string, apiKey: string) {
    this.baseURL = baseURL;
    this.apiKey = apiKey;
  }

  /**
   * Fetches a valid voucher code for a specific category from the API
   * @param category - The category identifier for the voucher
   * @returns The voucher code or null if request fails
   */
  async getVoucherCode(category: string): Promise<string | null> {
    try {
      const url = `${this.baseURL}/voucher-code/${category}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-API-KEY': this.apiKey,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.error(`Failed to fetch voucher code for category ${category}: ${response.status} ${response.statusText}`);
        return null;
      }

      const data: VoucherResponse = await response.json();
      
      // Return the code from the response, or the entire data if it's a string
      if (typeof data === 'string') {
        return data;
      }
      
      return data.code || null;
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
