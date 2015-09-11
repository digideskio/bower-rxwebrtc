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
			options.userMedia || rxwebrtc.defaults.userMedia;
			options.peerConnection = options.peerConnection || rxwebrtc.defaults.peerConnection;
			var session = new Session(options);
			session.gatherIce = session.iceCandidates.replay();
			console.log(session.gatherIce);
	
			session.subscriptions.push(session.gatherIce);
			session.status.onNext('USER_MEDIA');
			var call = rxwebrtc.getUserMedia(options.userMedia).flatMap(function (stream) {
				session.peerConnection.addStream(stream);
				session.localStream.onNext(stream);
				session.status.onNext('LOCAL_STREAM');
				session.status.onNext('RSVP');
				rxwebrtc.output.onNext({
					type: 'rsvp',
					sender: session.sender,
					recipient: session.recipient,
					session: session.id
				});
	
				return session.messages.filter(function (message) {
					return message.type === 'offer';
				}).first();
			}).flatMap(function (message) {
				session.status.onNext('OFFER_RECEIVED');
				if (message.sender) {
					rxwebrtc.merge(session.recipient, message.sender);
				}
				if (message.recipient) {
					rxwebrtc.merge(session.sender, message.recipient);
				}
				session.status.onNext('SET_REMOTE');
				session.iceCandidates.replay();
				return rxwebrtc.setRemoteDescription(session.peerConnection, message.offer);
			}).flatMap(function (result) {
				session.status.onNext('SET_ICE');
				session.gatherIce.subscribe(function (candidate) {
					rxwebrtc.addIceCandidate(session.peerConnection, candidate)['catch'](function (error) {
						console.warn(error);
					});
				});
				return rxwebrtc.createAnswer(session.peerConnection);
			}).flatMap(function (answer) {
				session.status.onNext('SET_LOCAL');
				session.peerConnection.setLocalDescription(answer); // Triggers ICE gathering
				session.status.onNext('SEND_ANSWER');
				rxwebrtc.output.onNext({
					type: 'answer',
					sender: session.sender,
					recipient: session.recipient,
					session: session.id,
					answer: answer
				});
				session.status.onNext('WAITING_FOR_ICE');
				return session.status.skipWhile(function (status) {
					return status !== 'CONNECTED';
				}).timeout(40000, 'Unable to setup a connection in 40 seconds');
			}).subscribe(function (status) {}, function (error) {
				session.status.onError(error);
			});
			session.subscriptions.push(call);
			return session;
		},
	
		answer: function answer(options) {
			options = options || {};
			options.userMedia || rxwebrtc.defaults.userMedia;
			options.peerConnection = options.peerConnection || rxwebrtc.defaults.peerConnection;
			var session = new Session(options);
			session.status.onNext('USER_MEDIA');
			var gatherIce = session.iceCandidates.subscribe(function (candidate) {
				rxwebrtc.addIceCandidate(session.peerConnection, candidate)['catch'](function (error) {
					console.warn(error);
				});
			});
			session.subscriptions.push(gatherIce);
	
			var answer = rxwebrtc.getUserMedia(options.userMedia).flatMap(function (stream) {
				session.peerConnection.addStream(stream);
				session.localStream.onNext(stream);
				session.status.onNext('LOCAL_STREAM');
				session.status.onNext('OFFER');
				return rxwebrtc.createOffer(session.peerConnection);
			}).flatMap(function (offer) {
				session.offer = offer;
				session.status.onNext('SET_LOCAL');
				session.peerConnection.setLocalDescription(offer); // Triggers ICE gathering
				rxwebrtc.output.onNext({
					type: 'offer',
					sender: session.sender,
					recipient: session.recipient,
					session: session.id,
					offer: session.offer
				});
				session.status.onNext('CALLING');
				return session.messages.filter(function (message) {
					return message.type === 'answer';
				}).first();
			}).flatMap(function (message) {
				if (message.sender) {
					rxwebrtc.merge(session.recipient, message.sender);
				}
				if (message.recipient) {
					rxwebrtc.merge(session.sender, message.recipient);
				}
				session.status.onNext('ANSWERED');
				session.status.onNext('SET_REMOTE');
				return rxwebrtc.setRemoteDescription(session.peerConnection, message.answer);
			}).flatMap(function () {
				return session.remoteStream.first();
			}).flatMap(function (stream) {
				session.status.onNext('CONNECTING');
				return session.status.skipWhile(function (status) {
					return status !== 'CONNECTED';
				}).timeout(30000, 'Unable to setup a connection in 30 seconds');
			}).subscribe(function (status) {}, function (error) {
				session.status.onError(error);
			});
			session.subscriptions.push(answer);
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
					console.log(sessionDescription);
					observer.onNext(sessionDescription);
					observer.onCompleted();
				}, function (err) {
					observer.onError(err);
				});
			});
		},
		setRemoteDescription: function setRemoteDescription(peerConnection, sessionDescription) {
			var RTCSessionDescription = window.RTCSessionDescription || cordova.plugins.iosrtc.RTCSessionDescription;
			return Rx.Observable.create(function (observer) {
				peerConnection.setRemoteDescription(new RTCSessionDescription(sessionDescription), function (result) {
					observer.onNext(result);
					observer.onCompleted();
				}, function (err) {
					observer.onError(err);
				});
			});
		},
		addIceCandidate: function addIceCandidate(peerConnection, iceCandidate) {
			var RTCIceCandidate = window.RTCIceCandidate || cordova.plugins.iosrtc.RTCIceCandidate;
			console.log('addIceCandidate', peerConnection);
			return new Promise(function (resolve, reject) {
				var candidate = new RTCIceCandidate(iceCandidate);
				peerConnection.addIceCandidate(candidate, resolve, reject);
			});
		},
		getUserMedia: getUserMedia,
		merge: function merge(target, source) {
			source = source || {};
			for (var key in source) {
				if (source.hasOwnProperty(key)) {
					target[key] = source[key];
				}
			}
			return target;
		}
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
	 * @implements Rx.Disposable
	 */
	function Session(options) {
		var _this = this;
	
		options = options || {};
		this.sender = options.sender || {};
		this.recipient = options.recipient || {};
		this.isDisposed = false;
	
		if (options.id) {
			this.id = options.id;
		} else {
			this.id = Session.guid();
		}
		this.status = new Rx.BehaviorSubject('NEW');
		var RTCPeerConnection = window.webkitRTCPeerConnection || cordova.plugins.iosrtc.RTCPeerConnection;
		this.peerConnection = new RTCPeerConnection(options.peerConnection);
		this.remoteStream = Rx.Observable.fromEvent(this.peerConnection, 'addstream').pluck('stream');
		this.localStream = new Rx.BehaviorSubject();
		this.messages = rxwebrtc.input.filter(function (message) {
			return message.session === _this.id;
		});
		window.peerConnection = this.peerConnection;
		var trickleIce = Rx.Observable.fromEvent(this.peerConnection, 'icecandidate').filter(function (e) {
			return e.candidate;
		}).subscribe(function (e) {
			rxwebrtc.output.onNext({
				type: 'ice',
				session: _this.id,
				candidate: e.candidate,
				sender: _this.sender,
				recipient: _this.recipient
			});
		});
		this.iceCandidates = this.messages.filter(function (message) {
			return message.type === 'ice';
		}).pluck('candidate');
		Rx.Observable.fromEvent(this.peerConnection, 'signalingstatechange').subscribe(function (e) {
			console.log('signalingstatechange', _this.peerConnection.signalingState);
		});
		Rx.Observable.fromEvent(this.peerConnection, 'addstream').subscribe(function (e) {
			console.log('onaddstream', e);
		});
		Rx.Observable.fromEvent(this.peerConnection, 'iceconnectionstatechange').subscribe(function (e) {
			console.log('signalingstatechange', _this.peerConnection.iceConnectionState);
		});
	
		var connectionState = Rx.Observable.fromEvent(this.peerConnection, 'iceconnectionstatechange').map(function (e) {
			console.log('iceconnectionstatechange', e);
			if (e.target) {
				return e.target.iceConnectionState;
			}
		}).subscribe(function (connectionState) {
			if (connectionState === 'connected' || connectionState === 'completed') {
				if (_this.status.value !== 'CONNECTED') {
					_this.status.onNext('CONNECTED');
				}
			} else if (connectionState === 'disconnected') {
				_this.status.onNext('DISCONNECTED');
				_this.status.onCompleted();
			}
		});
		this.subscriptions = [this.status, this.localStream, trickleIce, connectionState];
	};
	
	Session.prototype.dispose = function () {
		if (this.isDisposed) {
			return;
		}
		this.isDisposed = true;
		this.peerConnection.close();
		var mediaStream = this.localStream.value;
		if (mediaStream) {
			mediaStream.getTracks().map(function (track) {
				track.stop();
			});
		}
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