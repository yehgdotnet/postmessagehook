function fuzz_json(data, fuzz_func){
	/*
		Unpacks a JSON object and applies the callback to
		each property.
		
		The callback is passed the current value and should return the new
		value.
		
		Args:
			data:	Object to fuzz
			fuzz_func:	fuzzed function to apply to data
		
	*/
	//console.log("Fuzzing json");
	var fuzzed_objects = [];
	for(var key in data) {

		// Ensure we only deal with fuzzable props not builtins
		if(data.hasOwnProperty(key)) {
			// If its not an object send to simple fuzzer to apply callback
			if(typeof data[key] != "object"){

				// Obtain an array of fuzzed objects
				fuzzed = simple_fuzz(data[key],fuzz_func);
				
				// copy the object and insert fuzzed values.
				for(c=0;c < fuzzed.length; c++){
					// Make copy
					var copy = JSON.parse(JSON.stringify(data));
					// apply fuzzed value
					copy[key] = fuzzed[c];
					fuzzed_objects.push(copy);
				}
				
			}else{
				// Make a copy of the original so that the 
				// nested elements we pass in dont get changed in the original
				//var copy = JSON.parse(JSON.stringify(data));
				//var unpacked_nested_object = fuzz_json(copy[key],fuzz_func);
				
				// Here we use recursion to unpack to the point we can apply the fuzzer.
				// then we unpack these and add them to the return value
				var unpacked_nested_object = fuzz_json(data[key],fuzz_func)
				//console.log(unpacked_nested_object);
				for(var u=0,l=unpacked_nested_object.length; u<l; u++){
					// make another copy to allow us to change each value individually
					
					var copy2 = JSON.parse(JSON.stringify(data));
					copy2[key] = unpacked_nested_object[u];
					fuzzed_objects.push(copy2);
				}
			}
		}
    }
    return fuzzed_objects;
}

function is_json(str){
	try{
		JSON.parse(str);
		return true;
	}catch(e){
		return false;
	}
}


function simple_fuzz(data, fuzz_func){

	// Start with simple fuzz
	var fuzzed =  do_simple_fuzz(data, fuzz_func)

	// Try URL decode data then re-encode.

	if(typeof data == "string"){
		try{
			var urldecoded = decodeURIComponent(data);
			// If we got a change by decoding
			if(urldecoded !== data){
				var decoded_fuzz = do_simple_fuzz(urldecoded, fuzz_func);
				// now re encode and add back into the array

				for(var i=0; i < decoded_fuzz.length ; i++){

					fuzzed.push(encodeURIComponent(decoded_fuzz[i]))
				}
			}

		}catch(e){console.error(e)}

	}

	return fuzzed;
}


function do_simple_fuzz(data, fuzz_func){
	/*
	Fuzz postMessage event.data payloads.

	Arguments:
	    data:           The message
	    fuzz_func:      A callback that accepts each component to be fuzzed then returns the fuzzed value.
	Common structures include;
		*	JSON encoded data
		*	JSON encoded data in string format
		*	JSON encoded data in string format with a string prefix. someindentifer:{"param":value}
		*	Pipe delimited data
		*	URLEncoded / Ampersand delimited data.
		
	ToDo:
		JSON structure could also be an array rather than object, need to fix up checks for { and }
			
	*/
	var fuzzed = [];
	// JSON encoded data in string format
	if(typeof data == "string" && is_json(data)){
		//convert to object fuzz and then each element back to a string.
		var fuzzed_str_to_obj = fuzz_json(JSON.parse(data), fuzz_func);

		for(var i=0,l=fuzzed_str_to_obj.length; i<l; i++){
			fuzzed.push(JSON.stringify(fuzzed_str_to_obj[i]));
		}

    // JSON Object
	}else if(typeof data == "object"){
	

		fuzzed = fuzz_json(data, fuzz_func);
	}
	else if(typeof data == "string"){
		// Generic string fuzzers in here.
		
		//apply fuzzer
		fuzzed.push(fuzz_func(data))
		// JSON data with prefix
		try{
			if (data.split("{").length > 1 && data.split("{").length == data.split("{").length){

				// assuming that the part after the first { is JSON

				// Only deals with 1 JSON struct!! should improve this to get them all
				var start_json = data.indexOf("{")
				var end_json = data.lastIndexOf("}")

				var prefix = data.slice(0, start_json)
				var json_part = data.slice(start_json, end_json + 1)
				var suffix = data.slice(end_json + 1)
				//console.log(prefix)
				//console.log(json_part)
				//console.log(suffix)

				json_part_fuzzed= do_simple_fuzz(JSON.parse(json_part), fuzz_func)
				for(var i=0,l=json_part_fuzzed.length; i<l; i++){
					var ff = prefix + JSON.stringify(json_part_fuzzed[i]) + suffix
					fuzzed.push(ff);
				}

				
			}
		}catch(e){console.error(json_part)}

		try{
			// Delim fuzzer, breaks payload on several delimiters and fuzzes
			
			var delimiters  = ["&", "|","\n"]
			for(var i=0; i < delimiters.length; i++){
				var delim_fuzzed = delimfuzz(data, delimiters[i], fuzz_func);
				if(delim_fuzzed){
					fuzzed = fuzzed.concat(delim_fuzzed);
				}
			}

		}catch(e){console.error(e)}
	}
	else{
		//console.log("Got unexpected message type:" + typeof data);
		return [data];
	}

	return fuzzed;
}


// Handy regex functions
String.prototype.regexIndexOf = function(regex, startpos) {
    var indexOf = this.substring(startpos || 0).search(regex);
    return (indexOf >= 0) ? (indexOf + (startpos || 0)) : indexOf;
}

String.prototype.regexLastIndexOf = function(regex, startpos) {
    regex = (regex.global) ? regex : new RegExp(regex.source, "g" + (regex.ignoreCase ? "i" : "") + (regex.multiLine ? "m" : ""));
    if(typeof (startpos) == "undefined") {
        startpos = this.length;
    } else if(startpos < 0) {
        startpos = 0;
    }
    var stringToWorkWith = this.substring(0, startpos + 1);
    var lastIndexOf = -1;
    var nextStop = 0;
    while((result = regex.exec(stringToWorkWith)) != null) {
        lastIndexOf = result.index;
        regex.lastIndex = ++nextStop;
    }
    return lastIndexOf;
}

function dedupe_array(a) {
    var seen = {};
    var out = [];
    var len = a.length;
    var j = 0;
    for(var i = 0; i < len; i++) {
         var item = a[i];
         if(seen[item] !== 1) {
               seen[item] = 1;
               out[j++] = item;
         }
    }
    return out;
}


var fuzz_count = 0
function default_fuzz_callback(data){

    // test to see if the value looks like a URL.

    //var tag_payload = "<svg onload=alert(" +fuzz_count + ")>"

    /*
        Perhaps we can just prepend the javascript: proto handler to all payloads. Shouldn't harm
        innerHTML injections etc.

        Note: when triggering navigation events we are likely to navigate the page away from the vulnerable code
        therefore we should reload the page on each iteration.

    */
	//var tag_payload = "<iframe src=javascript:alert(" +fuzz_count + ")></iframe>"
    var tag_payload = " '\" onerror='top.alert("  +fuzz_count + ")//' onload='top.alert("  +fuzz_count + ")//' <iframe src=javascript:top.alert(" +fuzz_count + ")></iframe>"


    url_regex = /https*:\/\//i
    var payload;

    if(typeof data == "string" && data.regexIndexOf(url_regex,0) > -1){

        url_index = data.regexIndexOf(url_regex,0)

        payload = "javascript:top.alert(" + fuzz_count + ")//" + tag_payload;
        //insert the js uri handler just before the legit url
        payload = [data.slice(0, url_index), payload , data.slice(url_index)].join('');
    }else{
        payload = data + tag_payload
    }

    fuzzed = payload;
    fuzz_count = fuzz_count + 1;
    return fuzzed
}


function delimfuzz(data, delim, cb){
  var parts = data.split(delim);
  var fuzzed = [];
  
  if (parts.length ===1){
    return;
  }

  for(var i=0,l=parts.length; i<l; i++){
    var dup_parts = parts.slice();
    dup_parts[i] = cb(dup_parts[i]);
    fuzzed.push(dup_parts.join(delim));
    
  }

  return fuzzed;

}

// Appcheck Helper
function log_pm_exec(val){
    _X("ExecutedPM:" +val);

}

function xxx_run_basic_tests(){
	
	data = 'prefix{"username":"gary","type":"foo","messages":[{"message":"Your order has been dispatched","title":"Amazon Order Shipped #2089128387 Bloodborne PS4"},{"message":"Monthly scan completed. Click here to see results","title":"RE: Monthly Scans"},{"message":"Your temporary password is Sn0dl3P1g","title":"Password Reset"}]}'

	data = 'x=y&foo=bar&prefix{"username":"gary","type":"foo","messages":[{"message":"Your order has been dispatched","title":"Amazon Order Shipped #2089128387 Bloodborne PS4"},{"message":"Monthly scan completed. Click here to see results","title":"RE: Monthly Scans"},{"message":"Your temporary password is Sn0dl3P1g","title":"Password Reset"}]}'

	//data = '!_{"s":":/I9_1463938376497:_g_rpcReady","f":"..","r":"..","t":"27098990","c":19,"a":[null],"g":false}'
	//data = {"username":"gary","type":"foo","messages":[{"message":"Your order has been dispatched","title":"Amazon Order Shipped #2089128387 Bloodborne PS4"},{"message":"Monthly scan completed. Click here to see results","title":"RE: Monthly Scans"},{"message":"Your temporary password is Sn0dl3P1g","title":"Password Reset"}]}
	
	//data = {"somevalue" : "xyx", "encoded_json":"{\"key1\":\"value1\",\"key2\":\"value2\"}","someother":"otherval"}
	

	function mod_callback(data){
		return data + "<img src=a onerror=top.alert(1)>";
	}
	//out = fuzz_json(data,mod_callback)

	out = simple_fuzz(data,mod_callback)

	for(i=0; i< out.length;i++){
		console.warn(JSON.stringify(out[i]));  
	}

}