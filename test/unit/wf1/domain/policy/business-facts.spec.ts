import {
  RETURNS_POLICY_MESSAGE,
  RESERVATIONS_POLICY_MESSAGE,
  IMPORTS_POLICY_MESSAGE,
  EDITORIALS_POLICY_MESSAGE,
  INTERNATIONAL_SHIPPING_POLICY_MESSAGE,
  PROMOTIONS_POLICY_MESSAGE,
  SHIPPING_COST_POLICY_MESSAGE,
  PICKUP_STORE_POLICY_MESSAGE,
  STORE_HOURS_POLICY_MESSAGE,
  PAYMENT_METHODS_POLICY_MESSAGE,
  BUSINESS_FACTS,
} from '@/modules/wf1/domain/policy/business-facts';

describe('domain/policy/business-facts', () => {
  describe('Policy message constants', () => {
    describe('RETURNS_POLICY_MESSAGE', () => {
      it('is defined and non-empty', () => {
        expect(RETURNS_POLICY_MESSAGE).toBeDefined();
        expect(RETURNS_POLICY_MESSAGE.length).toBeGreaterThan(0);
        expect(typeof RETURNS_POLICY_MESSAGE).toBe('string');
      });

      it('contains key return policy information', () => {
        expect(RETURNS_POLICY_MESSAGE).toContain('30 dias');
        expect(RETURNS_POLICY_MESSAGE).toContain('cambios o devoluciones');
        expect(RETURNS_POLICY_MESSAGE).toContain('7 y 10 dias habiles');
        expect(RETURNS_POLICY_MESSAGE).toContain('48 horas');
      });
    });

    describe('RESERVATIONS_POLICY_MESSAGE', () => {
      it('is defined and non-empty', () => {
        expect(RESERVATIONS_POLICY_MESSAGE).toBeDefined();
        expect(RESERVATIONS_POLICY_MESSAGE.length).toBeGreaterThan(0);
      });

      it('contains key reservation policy information', () => {
        expect(RESERVATIONS_POLICY_MESSAGE).toContain('48 horas');
        expect(RESERVATIONS_POLICY_MESSAGE).toContain('30%');
        expect(RESERVATIONS_POLICY_MESSAGE).toContain('reservar');
      });

      it('includes contact information', () => {
        expect(RESERVATIONS_POLICY_MESSAGE).toContain('WhatsApp');
      });
    });

    describe('IMPORTS_POLICY_MESSAGE', () => {
      it('is defined and non-empty', () => {
        expect(IMPORTS_POLICY_MESSAGE).toBeDefined();
        expect(IMPORTS_POLICY_MESSAGE.length).toBeGreaterThan(0);
      });

      it('contains key import policy information', () => {
        expect(IMPORTS_POLICY_MESSAGE).toContain('30 a 60 dias');
        expect(IMPORTS_POLICY_MESSAGE).toContain('50%');
        expect(IMPORTS_POLICY_MESSAGE).toContain('importados');
      });
    });

    describe('EDITORIALS_POLICY_MESSAGE', () => {
      it('is defined and non-empty', () => {
        expect(EDITORIALS_POLICY_MESSAGE).toBeDefined();
        expect(EDITORIALS_POLICY_MESSAGE.length).toBeGreaterThan(0);
      });

      it('contains all featured editorial names', () => {
        expect(EDITORIALS_POLICY_MESSAGE).toContain('Ivrea');
        expect(EDITORIALS_POLICY_MESSAGE).toContain('Panini');
        expect(EDITORIALS_POLICY_MESSAGE).toContain('Mil Suenos');
      });

      it('mentions imported material', () => {
        expect(EDITORIALS_POLICY_MESSAGE).toContain('importado');
      });
    });

    describe('INTERNATIONAL_SHIPPING_POLICY_MESSAGE', () => {
      it('is defined and non-empty', () => {
        expect(INTERNATIONAL_SHIPPING_POLICY_MESSAGE).toBeDefined();
        expect(INTERNATIONAL_SHIPPING_POLICY_MESSAGE.length).toBeGreaterThan(0);
      });

      it('mentions DHL as carrier', () => {
        expect(INTERNATIONAL_SHIPPING_POLICY_MESSAGE).toContain('DHL');
      });

      it('mentions international shipping', () => {
        expect(INTERNATIONAL_SHIPPING_POLICY_MESSAGE).toContain('internacionales');
      });
    });

    describe('PROMOTIONS_POLICY_MESSAGE', () => {
      it('is defined and non-empty', () => {
        expect(PROMOTIONS_POLICY_MESSAGE).toBeDefined();
        expect(PROMOTIONS_POLICY_MESSAGE.length).toBeGreaterThan(0);
      });

      it('mentions promotions and variability', () => {
        expect(PROMOTIONS_POLICY_MESSAGE).toContain('promociones');
        expect(PROMOTIONS_POLICY_MESSAGE).toContain('variar');
      });
    });

    describe('SHIPPING_COST_POLICY_MESSAGE', () => {
      it('is defined and non-empty', () => {
        expect(SHIPPING_COST_POLICY_MESSAGE).toBeDefined();
        expect(SHIPPING_COST_POLICY_MESSAGE.length).toBeGreaterThan(0);
      });

      it('mentions checkout calculation', () => {
        expect(SHIPPING_COST_POLICY_MESSAGE).toContain('checkout');
      });
    });

    describe('PICKUP_STORE_POLICY_MESSAGE', () => {
      it('is defined and non-empty', () => {
        expect(PICKUP_STORE_POLICY_MESSAGE).toBeDefined();
        expect(PICKUP_STORE_POLICY_MESSAGE.length).toBeGreaterThan(0);
      });

      it('mentions store pickup and no cost', () => {
        expect(PICKUP_STORE_POLICY_MESSAGE).toContain('sucursal');
        expect(PICKUP_STORE_POLICY_MESSAGE).toContain('no tiene costo');
      });
    });

    describe('STORE_HOURS_POLICY_MESSAGE', () => {
      it('is defined and non-empty', () => {
        expect(STORE_HOURS_POLICY_MESSAGE).toBeDefined();
        expect(STORE_HOURS_POLICY_MESSAGE.length).toBeGreaterThan(0);
      });

      it('contains correct store hours', () => {
        expect(STORE_HOURS_POLICY_MESSAGE).toContain('10:00 a 19:00');
        expect(STORE_HOURS_POLICY_MESSAGE).toContain('10:00 a 17:00');
        expect(STORE_HOURS_POLICY_MESSAGE).toContain('Domingos cerrado');
      });

      it('specifies days of the week', () => {
        expect(STORE_HOURS_POLICY_MESSAGE).toContain('Lunes a viernes');
        expect(STORE_HOURS_POLICY_MESSAGE).toContain('Sabados');
      });
    });

    describe('PAYMENT_METHODS_POLICY_MESSAGE', () => {
      it('is defined and non-empty', () => {
        expect(PAYMENT_METHODS_POLICY_MESSAGE).toBeDefined();
        expect(PAYMENT_METHODS_POLICY_MESSAGE.length).toBeGreaterThan(0);
      });

      it('mentions payment methods', () => {
        expect(PAYMENT_METHODS_POLICY_MESSAGE).toContain('medios de pago');
      });

      it('distinguishes between in-store and online', () => {
        expect(PAYMENT_METHODS_POLICY_MESSAGE).toContain('local');
        expect(PAYMENT_METHODS_POLICY_MESSAGE).toContain('Online');
      });
    });
  });

  describe('BUSINESS_FACTS structured object', () => {
    it('is defined and frozen (as const)', () => {
      expect(BUSINESS_FACTS).toBeDefined();
      expect(typeof BUSINESS_FACTS).toBe('object');
    });

    describe('returns section', () => {
      it('has correct structure', () => {
        expect(BUSINESS_FACTS.returns).toBeDefined();
        expect(BUSINESS_FACTS.returns.durationDays).toBe(30);
        expect(BUSINESS_FACTS.returns.processingDays).toBe('7 y 10 dias habiles');
        expect(BUSINESS_FACTS.returns.damageReportHours).toBe(48);
        expect(BUSINESS_FACTS.returns.message).toBe(RETURNS_POLICY_MESSAGE);
      });

      it('has consistent data with message constant', () => {
        expect(BUSINESS_FACTS.returns.message).toContain('30 dias');
        expect(BUSINESS_FACTS.returns.message).toContain('7 y 10 dias habiles');
        expect(BUSINESS_FACTS.returns.message).toContain('48 horas');
      });
    });

    describe('reservations section', () => {
      it('has correct structure', () => {
        expect(BUSINESS_FACTS.reservations).toBeDefined();
        expect(BUSINESS_FACTS.reservations.durationHours).toBe(48);
        expect(BUSINESS_FACTS.reservations.depositPercentage).toBe(30);
        expect(BUSINESS_FACTS.reservations.message).toBe(RESERVATIONS_POLICY_MESSAGE);
      });

      it('has consistent data with message constant', () => {
        expect(BUSINESS_FACTS.reservations.message).toContain('48 horas');
        expect(BUSINESS_FACTS.reservations.message).toContain('30%');
      });
    });

    describe('imports section', () => {
      it('has correct structure', () => {
        expect(BUSINESS_FACTS.imports).toBeDefined();
        expect(BUSINESS_FACTS.imports.estimatedDays).toBe('30 a 60 dias');
        expect(BUSINESS_FACTS.imports.depositPercentage).toBe(50);
        expect(BUSINESS_FACTS.imports.message).toBe(IMPORTS_POLICY_MESSAGE);
      });

      it('has consistent data with message constant', () => {
        expect(BUSINESS_FACTS.imports.message).toContain('30 a 60 dias');
        expect(BUSINESS_FACTS.imports.message).toContain('50%');
      });
    });

    describe('storeHours section', () => {
      it('has correct structure', () => {
        expect(BUSINESS_FACTS.storeHours).toBeDefined();
        expect(BUSINESS_FACTS.storeHours.weekdays).toBe('Lunes a viernes 10:00 a 19:00 hs');
        expect(BUSINESS_FACTS.storeHours.saturday).toBe('Sabados 10:00 a 17:00 hs');
        expect(BUSINESS_FACTS.storeHours.sunday).toBe('Domingos cerrado');
        expect(BUSINESS_FACTS.storeHours.message).toBe(STORE_HOURS_POLICY_MESSAGE);
      });

      it('has consistent data with message constant', () => {
        expect(BUSINESS_FACTS.storeHours.message).toContain('10:00 a 19:00');
        expect(BUSINESS_FACTS.storeHours.message).toContain('10:00 a 17:00');
        expect(BUSINESS_FACTS.storeHours.message).toContain('Domingos cerrado');
      });
    });

    describe('contact section', () => {
      it('has correct structure', () => {
        expect(BUSINESS_FACTS.contact).toBeDefined();
        expect(typeof BUSINESS_FACTS.contact.email).toBe('string');
        expect(typeof BUSINESS_FACTS.contact.whatsapp).toBe('string');
      });

      it('has valid email format', () => {
        expect(BUSINESS_FACTS.contact.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
      });

      it('has valid WhatsApp format', () => {
        expect(BUSINESS_FACTS.contact.whatsapp).toMatch(/^\+?\d+/);
      });
    });
  });

  describe('Consistency checks', () => {
    it('all message constants are used in BUSINESS_FACTS', () => {
      const messagesInFacts = [
        BUSINESS_FACTS.returns.message,
        BUSINESS_FACTS.reservations.message,
        BUSINESS_FACTS.imports.message,
        BUSINESS_FACTS.storeHours.message,
      ];

      expect(messagesInFacts).toContain(RETURNS_POLICY_MESSAGE);
      expect(messagesInFacts).toContain(RESERVATIONS_POLICY_MESSAGE);
      expect(messagesInFacts).toContain(IMPORTS_POLICY_MESSAGE);
      expect(messagesInFacts).toContain(STORE_HOURS_POLICY_MESSAGE);
    });

    it('all policy messages use rioplatense Spanish', () => {
      const allMessages = [
        RETURNS_POLICY_MESSAGE,
        RESERVATIONS_POLICY_MESSAGE,
        IMPORTS_POLICY_MESSAGE,
        EDITORIALS_POLICY_MESSAGE,
        INTERNATIONAL_SHIPPING_POLICY_MESSAGE,
        PROMOTIONS_POLICY_MESSAGE,
        SHIPPING_COST_POLICY_MESSAGE,
        PICKUP_STORE_POLICY_MESSAGE,
        STORE_HOURS_POLICY_MESSAGE,
        PAYMENT_METHODS_POLICY_MESSAGE,
      ];

      // Check for "vos" conjugations (rioplatense Spanish)
      const hasVosConjugations = allMessages.some(
        (msg) =>
          msg.includes('tenes') ||
          msg.includes('queres') ||
          msg.includes('podes') ||
          msg.includes('necesitas'),
      );
      expect(hasVosConjugations).toBe(true);
    });

    it('no policy messages contain sensitive placeholder text', () => {
      const allMessages = [
        RETURNS_POLICY_MESSAGE,
        RESERVATIONS_POLICY_MESSAGE,
        IMPORTS_POLICY_MESSAGE,
        EDITORIALS_POLICY_MESSAGE,
        INTERNATIONAL_SHIPPING_POLICY_MESSAGE,
        PROMOTIONS_POLICY_MESSAGE,
        SHIPPING_COST_POLICY_MESSAGE,
        PICKUP_STORE_POLICY_MESSAGE,
        STORE_HOURS_POLICY_MESSAGE,
        PAYMENT_METHODS_POLICY_MESSAGE,
      ];

      for (const message of allMessages) {
        expect(message).not.toContain('TODO');
        expect(message).not.toContain('FIXME');
        expect(message).not.toContain('XXX');
        expect(message).not.toContain('[PLACEHOLDER]');
      }
    });
  });
});
