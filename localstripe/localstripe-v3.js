/*
 * Copyright 2017 Adrien Vergé
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

// First, get the domain from which this script is pulled:
const LOCALSTRIPE_SOURCE = (function () {
  const scripts = document.getElementsByTagName('script');
  var src;

  for (var i = 0; i < scripts.length; i++) {
    src = scripts[i].src;
    if (!src) {
      continue;
    }

    var m = src.match(/((?:https?:)\/\/[^\/]*)\/js\.stripe\.com\/v3/);
    if (m) {
      return m[1];
    }
  }

  // fallback on last script tag
  src = scripts[scripts.length - 1].src;
  return src.match(/https?:\/\/[^\/]*/)[0];
})();

// Check and warn if the real Stripe is already used in webpage
(function () {
  var iframes = document.getElementsByTagName('iframe');

  for (var i = 0; i < iframes.length; i++) {
    if (iframes[i].getAttribute('name').startsWith('__privateStripeFrame')) {
      console.log('localstripe: Stripe seems to be already used in page ' +
                  '(found a <iframe name="' + iframes[i].getAttribute('name') +
                  '"> in document). For the mock service to work, you need to' +
                  ' include its JavaScript library *before* creating Stripe ' +
                  'elements in the page.');
      //var fakeInput = document.createElement('input');
      //fakeInput.setAttribute('type', 'text');
      //fakeInput.setAttribute('value', 'coucou toi');

      //iframes[i].parentElement.insertBefore(fakeInput, iframes[i]);
      //iframes[i].parentElement.removeChild(iframes[i]);
    }
  }
})();

function openModal(text, confirmText, cancelText) {
  return new Promise(resolve => {
    const box = document.createElement('div'),
          p = document.createElement('p'),
          confirm = document.createElement('button'),
          cancel = document.createElement('button');
    box.appendChild(p);
    box.appendChild(confirm);
    box.appendChild(cancel);
    Object.assign(box.style, {
      position: 'absolute',
      width: '300px',
      top: '50%',
      left: '50%',
      margin: '-35px 0 0 -150px',
      padding: '10px 20px',
      border: '3px solid #ccc',
      background: '#fff',
      'text-align': 'center',
    });
    p.innerText = text;
    confirm.innerText = confirmText;
    cancel.innerText = cancelText;
    document.body.appendChild(box);
    confirm.addEventListener('click', () => {
      document.body.removeChild(box);
      resolve(true);
    });
    cancel.addEventListener('click', () => {
      document.body.removeChild(box);
      resolve(false);
    });
    confirm.focus();
  });
}

class Element {
  constructor(stripeElements, type) {
    // Element needs a reference to the object that created it, in order to
    // thoroughly destroy() itself.
    this._stripeElements = stripeElements;
    this._type = type;
    this.listeners = {};
    this._domChildren = [];
  }

  mount(domElement) {
    if (typeof domElement === 'string') {
      domElement = document.querySelector(domElement);
    } else if (!(domElement instanceof window.Element)) {
      throw new Error('Invalid DOM element. Make sure to call mount() with ' +
                      'a valid DOM element or selector.');
    }

    if (this._stripeElements._elements[this._type] !== this) {
      throw new Error('This Element has already been destroyed. Please ' +
                      'create a new one.');
    }

    if (this._domChildren.length) {
      if (domElement === this._domChildren[0].parentElement) {
        return;
      }
      throw new Error('This Element is already mounted. Use `unmount()` to ' +
                      'unmount the Element before re-mounting.');
    }

    const labelSpan = document.createElement('span');
    labelSpan.textContent = 'localstripe: ';
    this._domChildren.push(labelSpan);

    switch (this._type) {
      case 'cardNumber':
        this._inputs = {
          number: null,
        };
        break;
      case 'cardExpiry':
        this._inputs = {
          exp_month: null,
          exp_year: null,
        };
        break;
      case 'cardCvc':
        this._inputs = {
          cvc: null,
        };
        break;
      default:
        this._inputs = {
          number: null,
          exp_month: null,
          exp_year: null,
          cvc: null,
          postal_code: null,
        };
        break;
    }

    const changed = event => {
      this.value = {
        card: {
          number: this._inputs.number && this._inputs.number.value,
          exp_month: this._inputs.exp_month && this._inputs.exp_month.value,
          exp_year: this._inputs.exp_year && '20' + this._inputs.exp_year.value,
          cvc: this._inputs.cvc && this._inputs.cvc.value,
        },
        postal_code: this._inputs.postal_code && this._inputs.postal_code.value,
      };
      var evt = {
        elementType: this._type,
        empty: event.target.value.length == 0,
        complete: false,
        error: null,
        brand: this._cardBrand(),
      };

      switch (event.target) {
        case this._inputs.number:
          var numberLen = evt.brand == 'amex' ? 15 : 16;
          if (this.value.card.number.length >= numberLen) {
            evt.complete = true;
            this._inputs.exp_month && this._inputs.exp_month.focus();
          }
          break;
        case this._inputs.exp_month:
          if (parseInt(this.value.card.exp_month) > 1) {
            evt.complete = true;
            this._inputs.exp_year && this._inputs.exp_year.focus();
          }
          break;
        case this._inputs.exp_year:
          if (this.value.card.exp_year.length >= 4) {
            evt.complete = true;
            this._inputs.cvc && this._inputs.cvc.focus();
          }
          break;
        case this._inputs.cvc:
          if (this.value.card.cvc.length >= 3) {
            evt.complete = true;
            this._inputs.postal_code && this._inputs.postal_code.focus();
          }
          break;
      }

      (this.listeners['change'] || []).forEach(handler => handler(evt));
    };

    Object.keys(this._inputs).forEach(field => {
      this._inputs[field] = document.createElement('input');
      this._inputs[field].setAttribute('type', 'text');
      this._inputs[field].setAttribute('placeholder', field);
      this._inputs[field].setAttribute('size', field === 'number' ? 16 :
                                       field === 'postal_code' ? 5 :
                                       field === 'cvc' ? 3 : 2);
      this._inputs[field].oninput = changed;
      this._inputs[field].onblur = () => {
        (this.listeners['blur'] || []).forEach(handler => handler());
      };
      this._inputs[field].onfocus = () => {
        (this.listeners['focus'] || []).forEach(handler => handler());
      }
      this._domChildren.push(this._inputs[field]);
    });

    this._domChildren.forEach((child) => domElement.appendChild(child));
    (this.listeners['ready'] || []).forEach(handler => handler());
  }

  _cardBrand() {
    if (!this._inputs.number) {
      return 'unknown';
    }

    const brands = {
      'visa': '^4',
      'mastercard': '^(?:2(?:22[1-9]|2[3-9]|[3-6]|7[01]|720)|5[1-5])',
      'amex': '^3[47]',
      'discover': '^6(?:011|22|4[4-9]|5)',
      'diners': '^36',
      'jcb': '^35(?:2[89]|[3-8])',
      'unionpay': '^62',
    }
    Object.keys(brands).forEach(brand => {
      if (this._inputs.number.value.match(brands[brand])) {
        return brand;
      }
    });
    return 'unknown';
  }

  unmount() {
    while (this._domChildren.length) {
      this._domChildren.pop().remove();
    }
    this._inputs = undefined;
  }

  destroy() {
    this.unmount();
    if (this._stripeElements._elements[this._type] === this) {
      this._stripeElements._elements[this._type] = null;
    }
  }

  blur() {
    Object.keys(this._inputs).forEach(field => {
      this._inputs[field].blur();
    });
    (this.listeners['blur'] || []).forEach(handler => handler());
  }

  focus() {
    var field = Object.keys(this._inputs)[0];
    this._inputs[field].focus();
    (this.listeners['focus'] || []).forEach(handler => handler());
  }

  clear() {
    Object.keys(this._inputs).forEach(field => {
      this._inputs[field].value = '';
    });
  }

  update(options) {
    if (!options) {
      return;
    }
    if (options.value && options.value.postalCode && this._inputs.postal_code) {
      this._inputs.postal_code.value = options.value.postalCode;
    }
  }

  on(event, handler) {
    this.listeners[event] = this.listeners[event] || [];
    this.listeners[event].push(handler);
  }

  off(event, handler) {
    if (handler) {
      var i = this.listeners[event].indexOf(handler);
      this.listeners[event].splice(i, 1);
    } else {
      delete this.listeners[event];
    }
  }
}

function Stripe(apiKey) {
  var _elements = {};
  return window.stripe = {
    elements: () => {
      return {
        _elements: _elements,
        create: function(type, options) {
          if (this._elements[type]) {
            throw new Error('Can only create one Element of type ' + type);
          }
          if (!['card', 'cardNumber', 'cardExpiry', 'cardCvc'].includes(type)) {
            throw new Error('Element type not supported: ' + type);
          }
          this._elements[type] = new Element(this, type);
          return this._elements[type];
        },
        getElement: function(type) {
          return this._elements[type];
        }
      };
    },
    createToken: async (element) => {
      console.log('localstripe: Stripe().createToken()');
      let body = [];
      Object.keys(element.value.card).forEach(field => {
        body.push('card[' + field + ']=' + element.value.card[field]);
      });
      body.push('key=' + apiKey);
      body.push('payment_user_agent=localstripe');
      body = body.join('&');
      try {
        const url = `${LOCALSTRIPE_SOURCE}/v1/tokens`;
        const response = await fetch(url, {
          method: 'POST',
          headers: {'Content-Type': 'application/x-www-form-urlencoded'},
          body,
        });
        const res = await response.json().catch(() => ({}));
        if (response.status !== 200 || res.error) {
          return {error: res.error};
        } else {
          return {token: res};
        }
      } catch (err) {
        if (typeof err === 'object' && err.error) {
          return err;
        } else {
          return {error: err};
        }
      }
    },
    createSource: async (source) => {
      console.log('localstripe: Stripe().createSource()');
      try {
        const url = `${LOCALSTRIPE_SOURCE}/v1/sources`;
        const response = await fetch(url, {
          method: 'POST',
          body: JSON.stringify({
            key: apiKey,
            payment_user_agent: 'localstripe',
            ...source,
          }),
        });
        const res = await response.json().catch(() => ({}));
        if (response.status !== 200 || res.error) {
          return {error: res.error};
        } else {
          return {source: res};
        }
      } catch (err) {
        if (typeof err === 'object' && err.error) {
          return err;
        } else {
          return {error: err};
        }
      }
    },
    retrieveSource: () => {}, // TODO

    confirmCardSetup: async (clientSecret, data) => {
      console.log('localstripe: Stripe().confirmCardSetup()');
      try {
        const seti = clientSecret.match(/^(seti_\w+)_secret_/)[1];
        const url = `${LOCALSTRIPE_SOURCE}/v1/setup_intents/${seti}/confirm`;
        if (data.payment_method.card instanceof Element) {
          const element = data.payment_method.card;
          data.payment_method.card = element.value.card;
          data.payment_method.billing_details =
            data.payment_method.billing_details || {};
          data.payment_method.billing_details.address =
            data.payment_method.billing_details.address || {};
          data.payment_method.billing_details.address.postal_code =
            data.payment_method.billing_details.address.postal_code ||
            element.value.postal_code;
        }
        let response = await fetch(url, {
          method: 'POST',
          body: JSON.stringify({
            key: apiKey,
            use_stripe_sdk: true,
            client_secret: clientSecret,
            payment_method_data: {
              type: 'card',
              ...data.payment_method,
            },
          }),
        });
        let body = await response.json().catch(() => ({}));
        if (response.status !== 200 || body.error) {
          return {error: body.error};
        } else if (body.status === 'succeeded') {
          return {error: null, setupIntent: body};
        } else if (body.status === 'requires_action') {
          const url =
            (await openModal('3D Secure\nDo you want to confirm or cancel?',
                             'Complete authentication', 'Fail authentication'))
            ? `${LOCALSTRIPE_SOURCE}/v1/setup_intents/${seti}/confirm`
            : `${LOCALSTRIPE_SOURCE}/v1/setup_intents/${seti}/cancel`;
          response = await fetch(url, {
            method: 'POST',
            body: JSON.stringify({
              key: apiKey,
              use_stripe_sdk: true,
              client_secret: clientSecret,
            }),
          });
          body = await response.json().catch(() => ({}));
          if (response.status !== 200 || body.error) {
            return {error: body.error};
          } else if (body.status === 'succeeded') {
            return {error: null, setupIntent: body};
          } else {  // 3D Secure authentication cancelled by user:
            return {error: {message:
              'The latest attempt to set up the payment method has failed ' +
              'because authentication failed.'}};
          }
        } else {
          return {error: {message: `setup_intent has status ${body.status}`}};
        }
      } catch (err) {
        if (typeof err === 'object' && err.error) {
          return err;
        } else {
          return {error: err};
        }
      }
    },
    handleCardSetup:  // deprecated
      async function (clientSecret, element, data) {
        return this.confirmCardSetup(clientSecret, {
          payment_method: {
            card: element,
            ...data.payment_method_data,
          }});
      },
    confirmCardPayment: async (clientSecret, data) => {
      console.log('localstripe: Stripe().confirmCardPayment()');
      try {
        const success = await openModal(
          '3D Secure\nDo you want to confirm or cancel?',
          'Complete authentication', 'Fail authentication');
        const pi = clientSecret.match(/^(pi_\w+)_secret_/)[1];
        const url = `${LOCALSTRIPE_SOURCE}/v1/payment_intents/${pi}` +
                    `/_authenticate?success=${success}`;
        const response = await fetch(url, {
          method: 'POST',
          body: JSON.stringify({
            key: apiKey,
            client_secret: clientSecret,
          }),
        });
        const body = await response.json().catch(() => ({}));
        if (response.status !== 200 || body.error) {
          return {error: body.error};
        } else {
          return {paymentIntent: body};
        }
      } catch (err) {
        if (typeof err === 'object' && err.error) {
          return err;
        } else {
          return {error: err};
        }
      }
    },
    handleCardPayment:  // deprecated
      async function (clientSecret, element, data) {
        return this.confirmCardPayment(clientSecret);
      },

    confirmSepaDebitSetup: async (clientSecret, data) => {
      console.log('localstripe: Stripe().confirmSepaDebitSetup()');
      try {
        const seti = clientSecret.match(/^(seti_\w+)_secret_/)[1];
        const url = `${LOCALSTRIPE_SOURCE}/v1/setup_intents/${seti}/confirm`;
        let response = await fetch(url, {
          method: 'POST',
          body: JSON.stringify({
            key: apiKey,
            use_stripe_sdk: true,
            client_secret: clientSecret,
            payment_method_data: {
              type: 'sepa_debit',
              ...data.payment_method,
            },
          }),
        });
        const body = await response.json().catch(() => ({}));
        if (response.status !== 200 || body.error) {
          return {error: body.error};
        } else {
          return {setupIntent: body};
        }
      } catch (err) {
        if (typeof err === 'object' && err.error) {
          return err;
        } else {
          return {error: err};
        }
      }
    },

    createPaymentMethod: async (dataOrType, dataOrElement, legacyData) => {
      console.log('localstripe: Stripe().createPaymentMethod()');
      try {
        let data, element;
        let card = {};
        if (typeof dataOrType === 'string') {
          if (dataOrElement && dataOrElement.constructor && dataOrElement.constructor.name === 'Element') {
            data = legacyData;
            element = dataOrElement;
          } else {
            data = dataOrElement;
          }
          if (data.type && data.type !== dataOrType) {
            return {error: 'The type supplied in payment_method_data is not consistent.'};
          }
          data.type = dataOrType;
        } else {
          data = dataOrType;
          element = data.card;
        }

        if (element) {
          let types = ['card', 'cardNumber', 'cardExpiry', 'cardCvc'];
          types.forEach(type => {
            let elem = element._stripeElements.getElement(type);
            if (elem) {
              Object.keys(elem._inputs).forEach(field => {
                card[field] = elem._inputs[field].value;
              });
            }
          });
        }

        const url = `${LOCALSTRIPE_SOURCE}/v1/payment_methods`;
        let response = await fetch(url, {
          method: 'POST',
          body: JSON.stringify({
            key: apiKey,
            type: data.type,
            card: card,
            billing_details: data.billing_details,
          }),
        });
        const body = await response.json().catch(() => ({}));
        if (response.status !== 200 || body.error) {
          return {error: body.error};
        } else {
          return {paymentMethod: body};
        }
      } catch (err) {
        if (typeof err === 'object' && err.error) {
          return err;
        } else {
          return {error: err};
        }
      }
    },

    paymentRequest: function() {
      return {
        listeners: [],
        abort: () => {},
        canMakePayment: () => {
          return new Promise(resolve => {
            resolve(null);
          });
        },
        show: () => {},
        update: () => {},
        on: (event, handler) => {
          this.listeners[event] = this.listeners[event] || [];
          this.listeners[event].push(handler);
        },
        off: (event, handler) => {
          if (handler) {
            var i = this.listeners[event].indexOf(handler);
            this.listeners[event].splice(i, 1);
          } else {
            delete this.listeners[event];
          }
        }
      };
    },
  };
}

console.log('localstripe: The Stripe object was just replaced in the page. ' +
            'Stripe elements created from now on will be fake ones, ' +
            `communicating with the mock server at ${LOCALSTRIPE_SOURCE}.`);
