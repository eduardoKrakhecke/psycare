import { Injectable } from '@angular/core';

import type { CidOption } from '../models/diagnosis.model';

@Injectable({
  providedIn: 'root'
})
export class CidService {
  private catalogPromise?: Promise<readonly CidOption[]>;

  loadCatalog(): Promise<readonly CidOption[]> {
    if (!this.catalogPromise) {
      this.catalogPromise = fetch('/data/cid10.json')
        .then(response => {
          if (!response.ok) {
            throw new Error('Não foi possível carregar o catálogo CID-10.');
          }

          return response.json() as Promise<CidOption[]>;
        })
        .then(options => options.filter(option =>
          typeof option.code === 'string'
          && typeof option.description === 'string'
          && option.code.length > 0
          && option.description.length > 0
        ));
    }

    return this.catalogPromise;
  }
}
