import { Component } from '@angular/core';
import { Hl7MappingPageComponent } from './features/hl7-mapping/hl7-mapping-page/hl7-mapping-page.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [Hl7MappingPageComponent],
  template: '<app-hl7-mapping-page />',
})
export class AppComponent {}
