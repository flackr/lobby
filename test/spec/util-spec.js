describe("lobby.util", function() {

  describe("EventSource", function() {
    var customEventSource;
    function CallListener(id) {
      this.calledWith = [];
    }
    
    CallListener.prototype.call = function(/* args */) {
      this.calledWith.push(Array.prototype.slice.call(arguments, 0));
    }
    
    beforeEach(function() {
      customEventSource = new lobby.util.EventSource();
      customEventSource.addEventTypes(['fire']);
    });

    describe("with multiple listeners", function() {
      var listeners = [];
      var boundListener = [];
      
      beforeEach(function() {
        for (var i = 0; i < 3; i++) {
          listeners[i] = new CallListener();
          customEventSource.addEventListener('fire', boundListener[i] = listeners[i].call.bind(listeners[i]));
        }
      });
      
      it("dispatches all of its listeners", function() {
        customEventSource.dispatchEvent('fire');
        for (var i = 0; i < listeners.length; i++) {
          expect(listeners[i].calledWith.length).toEqual(1);
        }
      });

      it("can remove one listener", function() {
        customEventSource.removeEventListener('fire', boundListener[0]);
        customEventSource.dispatchEvent('fire');
        expect(listeners[0].calledWith.length).toEqual(0);
        for (var i = 1; i < listeners.length; i++) {
          expect(listeners[i].calledWith.length).toEqual(1);
        }
      });
    });
    
    it("includes passed arguments after bound arguments", function() {
      var listener = new CallListener();
      customEventSource.addEventListener('fire', listener.call.bind(listener, 'BoundArg1', 'BoundArg2'));
      customEventSource.dispatchEvent('fire', 'DispatchArg1', 'DispatchArg2');
      expect(listener.calledWith.length).toEqual(1);
      expect(listener.calledWith[0]).toEqual(['BoundArg1', 'BoundArg2', 'DispatchArg1', 'DispatchArg2']);
    });
    
    it("throws an Error if an unrecognized event type is used", function() {
      expect(function() {
        customEventSource.dispatchEvent('unregisteredEvent');
      }).toThrowError('cannot dispatch event listeners for unknown type unregisteredEvent');
      expect(function() {
        customEventSource.addEventListener('unregisteredEvent', function() {});
      }).toThrowError('cannot add event listener for unknown type unregisteredEvent');
      expect(function() {
        customEventSource.removeEventListener('unregisteredEvent', function() {});
      }).toThrowError('cannot remove event listener for unknown type unregisteredEvent');
    });
  });
});