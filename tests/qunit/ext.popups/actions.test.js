( function ( mw, $ ) {

	function generateToken() {
		return '9876543210';
	}

	QUnit.module( 'ext.popups/actions' );

	QUnit.test( '#boot', function ( assert ) {
		var config = new mw.Map(),
			stubUser = mw.popups.tests.stubs.createStubUser( /* isAnon = */ true ),
			stubUserSettings,
			action;

		config.set( {
			wgTitle: 'Foo',
			wgNamespaceNumber: 1,
			wgArticleId: 2,
			wgUserEditCount: 3
		} );

		stubUserSettings = {
			getPreviewCount: function () {
				return 22;
			}
		};

		assert.expect( 1 );

		action = mw.popups.actions.boot(
			false,
			stubUser,
			stubUserSettings,
			generateToken,
			config
		);

		assert.deepEqual(
			action,
			{
				type: 'BOOT',
				isEnabled: false,
				sessionToken: '0123456789',
				pageToken: '9876543210',
				page: {
					title: 'Foo',
					namespaceID: 1,
					id: 2
				},
				user: {
					isAnon: true,
					editCount: 3,
					previewCount: 22
				}
			}
		);
	} );

	/**
	 * Stubs `mw.popups.wait` and adds the deferred and its promise as properties
	 * of the module.
	 *
	 * @param {Object} module
	 */
	function setupWait( module ) {
		module.waitDeferred = $.Deferred();
		module.waitPromise = module.waitDeferred.promise();

		module.sandbox.stub( mw.popups, 'wait', function () {
			return module.waitPromise;
		} );
	}

	QUnit.module( 'ext.popups/actions#linkDwell @integration', {
		setup: function () {
			var that = this;

			this.el = $( '<a>' )
				.data( 'page-previews-title', 'Foo' )
				.eq( 0 );

			this.state = {};
			this.getState = function () {
				return that.state;
			};

			setupWait( this );
		}
	} );

	QUnit.test( '#linkDwell', function ( assert ) {
		var done = assert.async(),
			event = {},
			dispatch = this.sandbox.spy(),
			gatewayDeferred = $.Deferred(),
			gateway = function () {
				return gatewayDeferred;
			},
			el = this.el,
			fetchThunk,
			result = {};

		this.sandbox.stub( mw, 'now' ).returns( new Date() );

		mw.popups.actions.linkDwell( el, event, gateway, generateToken )(
			dispatch,
			this.getState
		);

		assert.deepEqual( dispatch.getCall( 0 ).args[0], {
			type: 'LINK_DWELL',
			el: el,
			event: event,
			interactionToken: '9876543210',
			timestamp: mw.now()
		} );

		// Stub the state tree being updated.
		this.state.preview = {
			enabled: true,
			activeLink: el
		};

		// ---

		this.waitPromise.then( function () {
			assert.strictEqual(
				dispatch.callCount,
				2,
				'The fetch action is dispatched after 500 ms'
			);

			fetchThunk = dispatch.secondCall.args[0];
			fetchThunk( dispatch );

			assert.ok( dispatch.calledWith( {
				type: 'FETCH_START',
				el: el,
				title: 'Foo'
			} ) );

			// ---

			gatewayDeferred.resolve( result );

			assert.ok( dispatch.calledWith( {
				type: 'FETCH_END',
				el: el,
				result: result
			} ) );

			done();
		} );

		// After 500 ms...
		this.waitDeferred.resolve();
	} );

	QUnit.test( '#linkDwell doesn\'t dispatch under certain conditions', function ( assert ) {
		var cases,
			done,
			that = this,
			event = {};

		cases = [
			{
				enabled: false
			},
			{
				enabled: true,
				activeLink: undefined // Any value other than this.el.
			}
		];

		done = assert.async( cases.length );

		$.each( cases, function ( testCase ) {
			var dispatch = that.sandbox.spy();

			mw.popups.actions.linkDwell( that.el, event, /* gateway = */ null, generateToken )(
				dispatch,
				that.getState
			);

			that.state.preview = testCase;

			that.waitPromise.then( function () {
				assert.strictEqual( dispatch.callCount, 1 );

				done();
			} );

			// After 500 ms...
			that.waitDeferred.resolve();
		} );
	} );

	QUnit.module( 'ext.popups/actions#linkAbandon', {
		setup: function () {
			setupWait( this );
		}
	} );

	QUnit.test( 'it should dispatch start and end actions', function ( assert ) {
		var that = this,
			dispatch = that.sandbox.spy(),
			done = assert.async();

		this.sandbox.stub( mw, 'now' ).returns( new Date() );

		mw.popups.actions.linkAbandon( that.el )( dispatch );

		assert.ok( dispatch.calledWith( {
			type: 'LINK_ABANDON_START',
			el: that.el,
			timestamp: mw.now()
		} ) );

		// ---

		assert.ok(
			mw.popups.wait.calledWith( 300 ),
			'Have you spoken with #Design about changing this value?'
		);

		that.waitPromise.then( function () {
			assert.ok( dispatch.calledWith( {
				type: 'LINK_ABANDON_END',
				el: that.el
			} ) );

			done();
		} );

		// After 300 ms...
		that.waitDeferred.resolve();
	} );

	QUnit.module( 'ext.popups/actions#previewAbandon', function ( assert ) {
		var that = this,
			dispatch = that.sandbox.spy(),
			done = assert.async();

		mw.popups.actions.previewAbandon()( dispatch );

		assert.ok( dispatch.calledWith( {
			type: 'PREVIEW_ABANDON_START'
		} ) );

		// ---

		assert.ok(
			mw.popups.wait.calledWith( 300 ),
			'Have you spoken with #Design about changing this value?'
		);

		that.waitPromise.then( function () {
			assert.ok( dispatch.calledWith( {
				type: 'PREVIEW_ABANDON_END'
			} ) );

			done();
		} );

		// After 300 ms...
		that.waitDeferred.resolve();
	} );

	QUnit.module( 'ext.popups/actions#saveSettings' );

	QUnit.test( 'it should dispatch an action with previous and current enabled state', function ( assert ) {
		var dispatch = this.sandbox.spy(),
			getState = this.sandbox.stub().returns( {
				preview: {
					enabled: false
				}
			} );

		mw.popups.actions.saveSettings( /* enabled = */ true )( dispatch, getState );

		assert.ok( getState.calledOnce, 'it should query the global state for the current state' );
		assert.ok( dispatch.calledWith( {
			type: 'SETTINGS_CHANGE',
			wasEnabled: false,
			enabled: true
		} ), 'it should dispatch the action with the previous and next enabled state' );
	} );
}( mediaWiki, jQuery ) );
