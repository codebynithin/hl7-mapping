import { provideHttpClient, withFetch } from '@angular/common/http';
import { ApplicationConfig } from '@angular/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { MessageService } from 'primeng/api';

export const appConfig: ApplicationConfig = {
  providers: [provideHttpClient(withFetch()), provideAnimations(), MessageService],
};
