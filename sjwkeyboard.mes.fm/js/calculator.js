$(document).ready(function(){

	var CALCULATOR = (function() {
		var isAndroid = false;
		var inputLength = 0;

		return {
			createSJWPhrase: function() {
				var SJWwords = 
				[
				"Tripled vaxxed but got covid and almost died. Imagine if I had not been vaxxed!",
				"REEEEEEEEEEEEEEEEEE.",
				"RACIST.",
				"XENOPHOBE.",
				"LITERALLY HITLER.",
				"HE WILL NOT DIVIDE US.",
				"I am LITERALLY going to kill myself.",
				"RUSSIA!!!",
				"I am so triggered right now!!!",
				"PEPE THE FROG IS A RACIST!",
				"Bana Alabed is NOT propaganda!",
				"SEXIST.",
				"BIGOT.",
				"ISLAMOPHOBE.",
				"NAZI!",
				"HOMOPHOBE.",
				"I identify as a gender-fluid apache helicopter.",
				"#BlackLivesMatter.",
				"WHITE SUPREMACIST.",
				"But she won the popular vote!",
				"But what about his tax returns??",
				"I can't even right now.",
				"Did you just assume my gender?",
				"FASCIST.",
				"Bill Clinton is NOT a RAPIST... CNN.COM",
				"WHITE MALE.",
				"white MALE.",
				"WHITE male.",
				"white male.",
				"Facts hurt my feelings :(",
				"Conformity is the new COUNTER-culture.",
				"!!!!!!!!!!!!!!!!!",
				"\u262D \u262D \u262D",
				"I am informed because I read the ECONOMIST :).",
				"My feelings ARE an argument!",
				"I\'m literally shaking right now.",
				"Ugh, I hate free speech.",
				"Narcissist!",
				"That has already been debunked by Snopes...",
				"I believe in Science.",
				"The Science™.",
				"Anti-vaxxers should be locked up.",
				"Anti-vaxxers should be hanged.",
				"I LOVE the Science.",
				"Fauci is a my hero.",
				"I LOVE Dr. Anthony Fauci.",
				"Fauci would never lie to me.",
				"I LOVE masks.",
				"I LOVE vaccines.",
				"What do the protesters want?",
				"I LOVE mandates.",
				"Your rights are no match for my feelings.",
				"People have too much freedom.",
				"I LOVE the Chinese social credit score system.",
				"I will continue to wear my mask FOREVER regardless of what the government says!",
				"Imagine thinking a criminal organization like Pfizer doesn't have our best interests at heart.",
				"You wear a seatbelt don't you???",
				"I HATE facts.",
				"Even if the vaxx saved just ONE life, it was worth it.",
				"MY GRANDMOTHER DIED OF COVID.",
				"You can't just have the freedom to get people sick.",
				"I blame the anti-vaxxers for the monkeypox outbreak!",
                "My Body My Choice... Sometimes",
                "My Body My Choice.... Except Vaccines",
                "My Body My Choice.... Except Masks",
                "My Body My Choice... Except Breathing",
                "My Body Government's Choice",
                "Fully Vaxxed Up-to-Date Vaxxed and Proud :)",
                "Monkeyvax mandates or lockdowns. Your choice anti-vaxxers.",
                "Antivaxxers brought back Polio!",
                "A monthly vax subscription service is pretty convenient!",
                "WW3 is a small price to pay to prevent Putin from taking Ukraine.",
                "Anti-vaxxers should have warned us more about the vax!",
                "Climate change causes myocarditis",
                "No one forced you to take the vax!",
                "Lifting mandates will kill billions.",
                "Take the Pforest Pfire Vax!",
				];
				$('#sjw-input').scrollTop($('#sjw-input')[0].scrollHeight);
				return SJWwords[Math.floor(Math.random()*SJWwords.length)];
			},

			copyLink: function(elem) {
				// create hidden text element, if it doesn't already exist
			    var targetId = "_hiddenCopyText_";
			    var isInput = elem.tagName === "INPUT" || elem.tagName === "TEXTAREA";
			    var origSelectionStart, origSelectionEnd;
			    if (isInput) {
			        // can just use the original source element for the selection and copy
			        target = elem;
			        origSelectionStart = elem.selectionStart;
			        origSelectionEnd = elem.selectionEnd;
			    } else {
			        // must use a temporary form element for the selection and copy
			        target = document.getElementById(targetId);
			        if (!target) {
			            var target = document.createElement("textarea");
			            target.style.position = "absolute";
			            target.style.left = "-9999px";
			            target.style.top = "0";
			            target.id = targetId;
			            document.body.appendChild(target);
			        }
			        target.textContent = elem.textContent;
			    }
			    // select the content
			    var currentFocus = document.activeElement;
			    target.focus();
			    target.setSelectionRange(0, target.value.length);
			    
			    // copy the selection
			    var succeed;
			    try {
			    	succeed = document.execCommand("copy");
			    } catch(e) {
			        succeed = false;
			    }
			    // restore original focus
			    if (currentFocus && typeof currentFocus.focus === "function") {
			        currentFocus.focus();
			    }
			    
			    if (isInput) {
			        // restore prior selection
			        elem.setSelectionRange(origSelectionStart, origSelectionEnd);
			    } else {
			        // clear temporary content
			        target.textContent = "";
			    }
			    return succeed;
			}
		}
	})();

	$("#sjw-input").keydown(function(event) {
		CALCULATOR.inputLength = $(this).val().length;
		var charCode = event.keyCode || event.which;

		if ((charCode > 64 && charCode < 91) || (charCode > 96 && charCode < 123)) {
			$(this).val($(this).val()+CALCULATOR.createSJWPhrase()+" ");
			event.preventDefault();
			CALCULATOR.isAndroid = false;
			return false;
		} else if (charCode == 229 || charCode == 0) {
			CALCULATOR.isAndroid = true;
		}
		return true;
	});

	$("#sjw-input").keyup(function(event) {
		if(CALCULATOR.isAndroid) {
			var str = $(this).val();
			var newInputLength = str.length;
			if(newInputLength < CALCULATOR.inputLength) return false;

			var charCode = str.charCodeAt(str.length - 1);

			if ((charCode > 64 && charCode < 91) || (charCode > 96 && charCode < 123)) {
				str = str.slice(0,-1);
				$("#sjw-input").val(str);
				$(this).val(str+CALCULATOR.createSJWPhrase()+" ");
			}
		}
	});

	$("#copy-text-button").click(function() {
		CALCULATOR.copyLink(document.getElementById("sjw-input"));
		$("#copied-tag").css("display","inline").fadeOut(2000);
	});

	$("#sjw-input").focus();
});