/******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId])
/******/ 			return installedModules[moduleId].exports;
/******/
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			exports: {},
/******/ 			id: moduleId,
/******/ 			loaded: false
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.loaded = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(0);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ function(module, exports, __webpack_require__) {

	'use strict';
	
	var Rx = __webpack_require__(1);
	var getUserMedia = __webpack_require__(2);
	var Session = __webpack_require__(3);;
	
	var rxwebrtc = {
	
		defaults: {
			peerConnection: {
				iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }]
			},
			userMedia: {
				video: true,
				audio: true
			}
		},
		/**
	  * Send message from sigaling server to this Rx.Subject 
	  */
		input: new Rx.Subject(),
	
		/**
	  * Emit messages from this Rx.Subject to the sigaling server
	  */
		output: new Rx.Subject(),
	
		/**
	  * @return Session
	  */
		call: function call(options) {
			options = options || {};
			options.target = options.target || 'UNKNOWN';
			options.userMedia || rxwebrtc.defaults.userMedia;
			options.peerConnection = options.peerConnection || rxwebrtc.defaults.peerConnection;
			var session = new Session(options);
			session.status.onNext('USER_MEDIA');
			var subscription = rxwebrtc.getUserMedia(options.userMedia || rxwebrtc.defaults.userMedia).flatMap(function (stream) {
				session.peerConnection.addStream(stream);
				session.localStream.onNext(stream);
				session.status.onNext('LOCAL_STREAM');
				return rxwebrtc.createOffer(session.peerConnection);
			}).flatMap(function (offer) {
				session.offer = offer;
				session.status.onNext('OFFER');
				session.peerConnection.setLocalDescription(offer); // Triggers ICE gathering
				return rxwebrtc.gatherIceCandidates(session.peerConnection);
			}).flatMap(function (iceCandidates) {
				session.status.onNext('ICE CANDIDATES: ' + iceCandidates.length);
				rxwebrtc.output.onNext({
					type: 'offer',
					target: options.target,
					session: session.id,
					offer: session.offer,
					iceCandidates: iceCandidates
				});
				session.status.onNext('CALLING');
				return session.messages.filter(function (message) {
					return message.type === 'answer';
				}).first();
	
				// var test = Rx.Observable.fromEvent(session.peerConnection, 'icecandidate').filter(function (e) {
				// 	return e.candidate;
				// }).subscribe(function (e) {
				// 	console.log('more ICE?', e.candidate);
				// });
				// session.subscriptions.push(test);
			}).flatMap(function (message) {
				session.status.onNext('ANSWERED');
				console.log(message);
				return rxwebrtc.setRemoteDescription(session.peerConnection, message.answer);
			}).subscribe(function (result) {
				console.log(result);
			});
			session.subscriptions.push(subscription);
			return session;
		},
	
		answer: function answer(options) {
			options = options || {};
			options.target = options.target || 'UNKNOWN';
			options.userMedia || rxwebrtc.defaults.userMedia;
			options.peerConnection = options.peerConnection || rxwebrtc.defaults.peerConnection;
			var session = new Session(options);
			session.status.onNext('USER_MEDIA');
	
			var subscription = rxwebrtc.getUserMedia(options.userMedia || rxwebrtc.defaults.userMedia).flatMap(function (stream) {
				session.peerConnection.addStream(stream);
				session.localStream.onNext(stream);
				session.status.onNext('LOCAL_STREAM');
				return rxwebrtc.setRemoteDescription(session.peerConnection, options.offer);
			}).flatMap(function () {
				session.status.onNext('REMOTE');
				if (options.iceCandidates) {
					options.iceCandidates.forEach(function (ice) {
						rxwebrtc.addIceCandidate(session.peerConnection, ice);
					});
				}
				return rxwebrtc.createAnswer(session.peerConnection);
			}).subscribe(function (answer) {
				rxwebrtc.output.onNext({
					type: 'answer',
					target: options.target,
					session: session.id,
					answer: answer
				});
			});
			session.subscriptions.push(subscription);
			return session;
		},
		gatherIceCandidates: function gatherIceCandidates(peerConnection) {
			return Rx.Observable.fromEvent(peerConnection, 'icecandidate').takeWhile(function (e) {
				return e.candidate;
			}).map(function (e) {
				return e.candidate;
			}).toArray();
		},
		createOffer: function createOffer(peerConnection) {
			return Rx.Observable.create(function (observer) {
				peerConnection.createOffer(function (sessionDescription) {
					observer.onNext(sessionDescription);
					observer.onCompleted();
				}, function (err) {
					observer.onError(err);
				});
			});
		},
		createAnswer: function createAnswer(peerConnection) {
			return Rx.Observable.create(function (observer) {
				peerConnection.createAnswer(function (sessionDescription) {
					observer.onNext(sessionDescription);
					observer.onCompleted();
				}, function (err) {
					observer.onError(err);
				});
			});
		},
		setRemoteDescription: function setRemoteDescription(peerConnection, sessionDescription) {
			console.log(sessionDescription);
			var RTCSessionDescription = window.RTCSessionDescription || cordova.plugins.iosrtc.RTCSessionDescription;
			return Rx.Observable.create(function (observer) {
				peerConnection.setRemoteDescription(new RTCSessionDescription(sessionDescription), function (result) {
					console.log(result);
					observer.onNext(result);
					observer.onCompleted();
				}, function (err) {
					observer.onError(err);
				});
			});
		},
		addIceCandidate: function addIceCandidate(peerConnection, iceCandidate) {
			var RTCIceCandidate = window.RTCIceCandidate || cordova.plugins.iosrtc.RTCIceCandidate;
			peerConnection.addIceCandidate(new RTCIceCandidate(iceCandidate));
		},
		getUserMedia: getUserMedia
	};
	
	window.rxwebrtc = rxwebrtc;

/***/ },
/* 1 */
/***/ function(module, exports) {

	module.exports = Rx;

/***/ },
/* 2 */
/***/ function(module, exports, __webpack_require__) {

	'use strict';
	
	var Rx = __webpack_require__(1);
	/**
	 * getUserMedia as an Observable
	 *
	 * @return Rx.Observable 
	 */
	function getUserMedia(options) {
		var getUserMedia = navigator.webkitGetUserMedia ? navigator.webkitGetUserMedia.bind(navigator) : cordova.plugins.iosrtc.getUserMedia.bind(cordova.plugins.iosrtc);
		return Rx.Observable.create(function (observer) {
			getUserMedia(options, function (stream) {
				observer.onNext(stream);
				observer.onCompleted();
			}, function (err) {
				observer.onError(err);
			});
		});
	}
	
	module.exports = getUserMedia;

/***/ },
/* 3 */
/***/ function(module, exports, __webpack_require__) {

	'use strict';
	
	var Rx = __webpack_require__(1);
	/**
	 * @extends IDisposable
	 */
	function Session(options) {
		var _this = this;
	
		options = options || {};
	
		if (options.id) {
			this.id = options.id;
		} else {
			this.id = Session.guid();
		}
		this.status = new Rx.BehaviorSubject('NEW');
		var RTCPeerConnection = window.webkitRTCPeerConnection || cordova.plugins.iosrtc.RTCPeerConnection;
		this.peerConnection = new RTCPeerConnection(options.peerConnection);
		this.remoteStream = Rx.Observable.fromEvent(this.peerConnection, 'addstream');
		this.localStream = new Rx.BehaviorSubject();
		this.messages = rxwebrtc.input.filter(function (message) {
			return message.id === _this.id;
		});
		var remoteStreamSubscription = this.remoteStream.subscribe(function (stream) {
			_this.status.onNext('REMOTE_STREAM');
		});
		this.subscriptions = [this.status, this.localStream, remoteStreamSubscription];
	};
	
	Session.prototype.dispose = function () {
		// if (this.status.value === 'CALLING')
		this.subscriptions.forEach(function (subscription) {
			subscription.dispose();
		});
	};
	
	Session.guid = function () {
		return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
			var r = Math.random() * 16 | 0,
			    v = c == 'x' ? r : r & 0x3 | 0x8;
			return v.toString(16);
		});
	};
	
	module.exports = Session;

/***/ }
/******/ ]);
//# sourceMappingURL=rxwebrtc.js.map