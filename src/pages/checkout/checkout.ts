import { Component, ViewChild, ElementRef, OnInit } from '@angular/core';
import { IonicPage, NavController, NavParams, LoadingController, ViewController, ToastController, Slides } from 'ionic-angular';
import { WooProvider } from '../../providers/woo/woo';
import { Storage } from '@ionic/storage';
import { StripeService, Elements, Element as StripeElement, ElementsOptions } from "ngx-stripe";

/**
 * Generated class for the CheckoutPage page.
 *
 * See https://ionicframework.com/docs/components/#navigation for more info on
 * Ionic pages and navigation.
 */

@IonicPage()
@Component({
  selector: 'page-checkout',
  templateUrl: 'checkout.html',
})
export class CheckoutPage implements OnInit {

	@ViewChild(Slides) slides: Slides;

	order: any = {
		billing: Object
	}
	spinner: any
	cart_contents: any
	gateways: any
	shipping_methods: any
	isLastSlide: boolean = false
	billing_shipping_same: boolean = true
	elements: Elements;
  	card: StripeElement;
	@ViewChild('card') cardRef: ElementRef;
	// optional parameters
	elementsOptions: ElementsOptions = {
		locale: 'en'
	};

	constructor(
		public navCtrl: NavController, 
		public navParams: NavParams,
		public wooProvider: WooProvider,
		public loadingCtrl: LoadingController,
		public viewCtrl: ViewController,
		public storage: Storage,
		public toastCtrl: ToastController,
		private stripeService: StripeService
		) {

		this.storage.get( 'cart' ).then( data => {

			if( !data )
				this.presentToast( 'No cart items.' );

			console.log('cart', data)

			this.cart_contents = data

		})

		this.getGateways()
		this.getShipping()

		

	}

	ngOnInit() {
		this.loadStripe()
	}


	getGateways() {

		this.wooProvider.get( '/wp-json/wc/v2/payment_gateways', null ).then( response => {
			console.log(response)
			this.gateways = []
			for (var i = 0; i < (<any>response).length; ++i) {
				if( response[i].enabled ) {
					this.gateways.push( response[i] )
				}
			}
		})

	}

	getShipping() {

		this.wooProvider.get( '/wp-json/wc/v2/shipping_methods', null ).then( response => {
			console.log(response)
			this.shipping_methods = response
		})

	}

	loadStripe() {

		this.stripeService.elements( this.elementsOptions )
	      .subscribe(elements => {
	        this.elements = elements;
	        // Only mount the element the first time
	        if (!this.card) {
	        	console.log('creating card')
	          this.card = this.elements.create('card', {
	            style: {
	              base: {
	                iconColor: '#666EE8',
	                color: '#31325F',
	                lineHeight: '40px',
	                fontWeight: 300,
	                fontFamily: '"Helvetica Neue", Helvetica, sans-serif',
	                fontSize: '18px',
	                '::placeholder': {
	                  color: '#CFD7E0'
	                }
	              }
	            }
	          });
	          this.card.mount('#card-element');
	        }
	      });
	}

	submit() {}

	doCheckout( data ) {

		console.log(data.value)
		let order = data.value
		
		if( !order ) {
			this.presentToast( 'No order data submitted.' );
			return;
		}

		if( !this.cart_contents ) {
			this.presentToast( 'No cart items.' );
			return;
		}

		if( !order.billing.first_name || !order.billing.postcode || !order.payment_method ) {
			this.presentToast( 'Please fill out all required fields.' );
			this.slides.slideTo(0)
			return;
		}

		if( order.billing.billing_shipping_same === false ) {
			// fill shipping address
		} else {
			order.shipping = order.billing
			console.log('shipping', order.shipping)
		}

		if( order.shipping_lines ) {

			switch( order.shipping_lines.method_id ) {
				case 'flat_rate':
					order.shipping_lines.method_title = 'Flat Rate'
					order.shipping_lines.total = '10'
				break;
			}

		}

		order.shipping_lines = [order.shipping_lines]

		order.line_items = []

		for (var i = 0; i < this.cart_contents.length; ++i) {
			order.line_items[i] = {
				product_id: this.cart_contents[i].product_id,
				variation_id: this.cart_contents[i].variation_id,
				quantity: parseInt( this.cart_contents[i].quantity )
			}
		}

		this.showSpinner()

		this.wooProvider.send( order, 'wp-json/wc/v2/orders' ).then( response => {

			if( !(<any>response).id ) {
				console.log(response)
				this.hideSpinner()
				this.presentToast( 'There was a problem processing your order, please try again.' );
				return;
			}

			if( order.payment_method === 'stripe' ) {
				this.stripePayment((<any>response).id, this.card, order.billing.first_name)
			}

		}, (err) => {

		this.hideSpinner()
		console.log(err)

		}).catch( e => {
			console.warn(e)
			this.hideSpinner()
			this.presentToast( 'There was a problem connecting to the server.' );
		})

		// make sure spinner disappears even if there's a problem
		setTimeout( () => {
			this.hideSpinner();
		}, 5000 );

	}

	stripePayment( order_id, card, name ) {

		console.log('stripe payment', order_id, card, name)

		this.stripeService
	      .createToken(card, { name })
	      .subscribe(result => {
	        if (result.token) {
	          // Use the token to create a charge or a customer
	          // https://stripe.com/docs/charges
	          console.log(result);
	          this.sendToken( result.token.id, order_id )
	        } else if (result.error) {
	          // Error creating the token
	          console.log(result.error.message);
	        }
	      });

	}

	sendToken( token, order_id ) {

		let data = {
			order_id: order_id,
			payment_token: token,
			payment_method: 'stripe'
		}

		console.log('send token', data)

		this.wooProvider.send( data, 'wp-json/wc/v2/stripe-payment' ).then( response => {

			console.log(response)

			this.presentToast( 'Thank you for your order!' );

			this.storage.remove( 'cart' )

			let opt = {};

			this.navCtrl.push('ThanksPage', {
			  order_id: order_id
			}, opt);

			this.dismiss()

		}, (err) => {

		this.hideSpinner()
		console.log(err)

		}).catch( e => {
			console.warn(e)
			this.hideSpinner()
			this.presentToast( 'There was a problem connecting to the server.' );
		})

	}

	dismiss() {
		this.viewCtrl.dismiss();
	}

	showSpinner() {
		this.spinner = this.loadingCtrl.create();

		this.spinner.present();
	}

	hideSpinner() {
		this.spinner.dismiss();
	}

	presentToast(msg) {

	    let toast = this.toastCtrl.create({
	      message: msg,
	      duration: 5000,
	      position: 'bottom'
	    });

	    toast.present();

	}

	nextSlide() {
		this.slides.slideNext()
	}

	prevSlide() {
		this.slides.slidePrev()
	}

	slideChanged() {

		if( this.slides.isEnd() ) {
			this.isLastSlide = true
		} else {
			this.isLastSlide = false
		}
	}

	billingShippingToggle(e) {
		this.billing_shipping_same = e.checked
		console.log(e.checked)
	}

}
