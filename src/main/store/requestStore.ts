import { RequestRecord } from '../../shared/models';

const MAX_RECORDS = 2000;

export class RequestStore {
  private records: RequestRecord[] = [];
  private recordMap: Map<string, RequestRecord> = new Map();

  add(record: RequestRecord): void {
    // 如果已存在则更新
    const existing = this.recordMap.get(record.id);
    if (existing) {
      Object.assign(existing, record);
      return;
    }

    // 环形缓冲区：超过最大数量时删除最旧的
    if (this.records.length >= MAX_RECORDS) {
      const oldest = this.records.shift();
      if (oldest) {
        this.recordMap.delete(oldest.id);
      }
    }

    this.records.push(record);
    this.recordMap.set(record.id, record);
  }

  getAll(): RequestRecord[] {
    return [...this.records].reverse(); // 最新的在前
  }

  getById(id: string): RequestRecord | undefined {
    return this.recordMap.get(id);
  }

  filter(criteria: {
    method?: string;
    host?: string;
    statusCode?: number;
    search?: string;
  }): RequestRecord[] {
    let result = this.records;

    if (criteria.method) {
      result = result.filter(r => r.request.method === criteria.method);
    }

    if (criteria.host) {
      result = result.filter(r => {
        try {
          const url = new URL(r.request.url);
          return url.host.includes(criteria.host!);
        } catch {
          return false;
        }
      });
    }

    if (criteria.statusCode) {
      result = result.filter(r => r.response?.statusCode === criteria.statusCode);
    }

    if (criteria.search) {
      const searchLower = criteria.search.toLowerCase();
      result = result.filter(r => 
        r.request.url.toLowerCase().includes(searchLower) ||
        r.request.method.toLowerCase().includes(searchLower)
      );
    }

    return [...result].reverse();
  }

  clear(): void {
    this.records = [];
    this.recordMap.clear();
  }

  getCount(): number {
    return this.records.length;
  }
}
