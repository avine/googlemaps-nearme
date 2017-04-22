
jQuery(document).ready(function ($) {

  // View input
  function $input(name) {
    return $('#avn-geo-form [name="' + name + '"]');
  }
  function inputStep() {
    var
    $this = $(this),
    curr = $this.val(),
    prev = $this.data('previous'),
    getPrecision = function (v) {
      return v ? (v.split('.')[1] || '').length : 0;
    },
    prevPrec = getPrecision(prev),
    currPrec = getPrecision(curr),
    diffPrec = Math.abs(prevPrec - currPrec),
    precision = diffPrec < 2 ? Math.max(prevPrec, currPrec) : currPrec + 1;
    
    $this.attr('step', precision ? 1 / Math.pow(10, precision) : 'any');
    $this.data('previous', curr);
  }
  inputStep.call($input('latitude'));
  inputStep.call($input('longitude'));
  $input('latitude').on('input', inputStep);
  $input('longitude').on('input', inputStep);
    
  // View message
  var $message = $('#avn-geo-message');
  function message(text) {
    if (text) text = '<i class="fa fa-info-circle"></i> ' + text;
    $message.html(text);
  }
  
  // Model
  var coords = {
    latitude: undefined,
    longitude: undefined
  };
  function setCoord(key, val) {
    coords[key] = parseFloat(val) || undefined;
    // Update view
    $input(key).val(coords[key]);
    inputStep.call($input(key));
  }
  function setCoords(latitude, longitude) {
    setCoord('latitude', latitude);
    setCoord('longitude', longitude);
  }
  function haveCoords() {
    return undefined !== coords.latitude && undefined !== coords.longitude;
  }
  
  // Update model from view
  function updateCoords() {
    setCoords($input('latitude').val(), $input('longitude').val());
  }

  // Geolocalisation promise
  function getPosition() {
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) {
        return reject("Geolocation is not supported by this browser.");
      }
      navigator.geolocation.getCurrentPosition(function (position) {
        resolve(position);   
      }, function (error) {
        switch(error.code) {
          case error.PERMISSION_DENIED:
            reject("User denied the request for Geolocation."); break;
          case error.POSITION_UNAVAILABLE:
            reject("Location information is unavailable."); break;
          case error.TIMEOUT:
            reject("The request to get user location timed out."); break;
          case error.UNKNOWN_ERROR:
            reject("An unknown error occurred."); break;
        }
      }, {
        maximumAge: 60000,
        enableHighAccuracy: true
      });
    });
  }

  // Handle form action
  $input('geo').click(function () {
    getPosition().then(function (position) {
      message('Geolocalized!');
      setCoords(position.coords.latitude, position.coords.longitude);
    }, function (reason) {
      message(reason);
    });
  });
  $input('map').click(function () {
    updateCoords();
    haveCoords() ? displayMap() : message("Coordonates are missing!");
  });
  $('#avn-geo-form').submit(function (e) {
    e.preventDefault();
  });
  $('#avn-geo-form').change(function () {
    message("");
  });

  // Init
  updateCoords();

  // Map
  var $map = $('#avn-geo-map'), map, centerMarker;
  function displayMap() {
    var center = new google.maps.LatLng(coords.latitude, coords.longitude);
    if (!map) {
      // Map
      map = new google.maps.Map($map.get(0), {
        center: center,
        mapTypeId: google.maps.MapTypeId.ROADMAP,
        zoom: 13
      });
      handleMapEvent('bounds_changed', function () {
        !haveDataset() || displayMarkers();
      });
      // Marker
      centerMarker = new google.maps.Marker({
        position: center,
        map: map,
        icon: 'images/placeholder.png'
      });
    } else {
      map.panTo(center);
      if (!centerMarker.getPosition().equals(center)) {
        reset();
        centerMarker.setPosition(center);
      }
    }
    haveDataset() || getDataset().then(displayMarkers);
  }
  
  // Map event handler
  function handleMapEvent(event, callback) {
    var timeout;
    google.maps.event.addListener(map, event, function() {
      clearTimeout(timeout);
      timeout = setTimeout(callback, 500);
    });
  }
  
  // Markers
  var markers = [], infoWindow = new google.maps.InfoWindow();
  function displayMarker(latitude, longitude, options) {
    var marker = new google.maps.Marker($.extend({
      position: {
        lat: latitude,
        lng: longitude
      },
      map: map
    }, options || {}));
    
    var
    $content = $('<div><h3>Info:</h3><p>' + options.title + '</p></div>').addClass('avn-geo-map-info'),
    $link = $('<a href="#"><i class="fa fa-map-signs"></i> GO</a>').click(function (e) {
      e.preventDefault();
      travel(latitude, longitude);
    }).appendTo($content);
    
    marker.addListener('click', function() {
      infoWindow.setContent($content.get(0));
      infoWindow.open(map, marker);
    });
    markers.push(marker);
  }
  function removeMarkers() {
    markers.forEach(function (markers) {
      markers.setMap(null);
    });
    dataset.forEach(function (item) {
      item.mapped = false;
    });
  }
  function displayMarkers() {
    var bounds = map.getBounds();
    dataset.forEach(function (item) {
      if (item.mapped) {
        return;  
      }
      if (item.latitude && item.longitude) {
        add(item);
      } else if (item.address) {
        codeAddress(item.address).then(function (position) {
          $.extend(item, position); // Update dataset with geocoded position
          add(item);
        });
      } else {
        console.warn('Invalid dataset entry', item);
      }
    });
    function add(item) {
      if (bounds.contains(new google.maps.LatLng(item.latitude, item.longitude))) {
        displayMarker(item.latitude, item.longitude, { title: item.title });
        item.mapped = true;
      }
    }
  }

  // Geocoding
  var geocoder = new google.maps.Geocoder();
  function codeAddress(address) {
    return new Promise(function (resolve, reject) {
      geocoder.geocode({ 'address': address }, function(results, status) {
        if (status == google.maps.GeocoderStatus.OK) {
          var location = results[0].geometry.location;
          resolve({
            latitude: location.lat(),
            longitude: location.lng()
          });
        } else {
          reject(status);
        }
      });
    });
  }

  // Travel
  var directionsDisplay = new google.maps.DirectionsRenderer();
  function travel(toLatitude, toLongitude) {
    directionsDisplay.setMap(null);
    var request = {
      origin: new google.maps.LatLng(coords.latitude, coords.longitude),
      destination: new google.maps.LatLng(toLatitude, toLongitude),
      travelMode: google.maps.TravelMode.DRIVING
    };
    new google.maps.DirectionsService().route(request, function(result, status) {
      if (status == google.maps.DirectionsStatus.OK) {
        directionsDisplay.setMap(map);
        directionsDisplay.setDirections(result);
      }
    });
  }
  
  // Data
  var 
  dataset = null,
  demoCat,
  demoRand = function () {
    return Math.random() / 10 * (Math.random() > .5 ? 1 : -1);
  };
  function getDataset(n) { 
    n = n || 10;
    return new Promise(function (resolve) {
      //if (haveDataset()) return resolve(dataset);
      dataset = [];
      for (var i = 0; i < n; i++) {
        dataset.push({
          address: '',
          latitude: coords.latitude + demoRand(),
          longitude: coords.longitude + demoRand(),
          title: ['Marker', demoCat, i].join(' '),
          mapped: false
        });
      }
      // Add entry with address
      dataset.push({
        address: '143 rue Manin 75019 Paris France',
        latitude: undefined,
        longitude: undefined,
        title: "That's my home!", // ['Marker', demoCat, i].join(' '),
        mapped: false
      });
      setTimeout(function () { resolve(dataset); }, 100);
    });
  }
  function removeDataset() {
    dataset = null;
  }
  function haveDataset() {
    return null !== dataset;
  }
  
  // Reset dataset and markers
  function reset() {
    // Remove markers
    if (haveDataset()) removeMarkers();
    // Remove travel
    if (directionsDisplay) directionsDisplay.setMap(null);
    // Remove dataset
    dataset = null;
    // Update category
    demoCat = $input('category').val();
  }

  // Change category
  $input('category').change(reset).trigger('change');
});
