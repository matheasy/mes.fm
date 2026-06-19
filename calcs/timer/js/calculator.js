$(document).ready(function(){

	var CALCULATOR = (function() {

		return {
            interval: 0,
            interval2: 0,
            interval3: 0,
            alarmAudio: new Audio('audio/grandfather_alarm_clock.wav'),
            alarmOn: false,
            muteSound: false,
            numSplits: 1,
            numSplits2: 1,
            currentTool: 1, //0 = none, 1 = countdown timer, 2 = stopwatch, 3 = alarm clock
            alarmTimeOut: 0,

			countDown: function(target) {
				var start = new Date().getTime();
				var elapsedTime = 0;
				var title = "";

				CALCULATOR.interval = setInterval(function()
				{
				    var time = new Date().getTime() - start;

				    //elapsedTime = (Math.floor(time / 100) / 10); //get seconds to 3 decimal point
				    elapsedTime = (time/1000).toFixed(3);

				    //seconds remaining
				    var remainingTime = String((target - elapsedTime).toFixed(3));

				    //convert seconds to hours/minutes/seconds remaining
					var hours = Math.floor((parseInt(remainingTime) / 60 / 60));
					var minutes = Math.floor((parseInt(remainingTime) / 60) - hours*60);
					var seconds = Math.floor(parseInt(remainingTime) - hours * 60 * 60 - minutes * 60);

					hours = CALCULATOR.addZero(hours);
					minutes = CALCULATOR.addZero(minutes);
					seconds = CALCULATOR.addZero(seconds);

					remainingTime = remainingTime.split('.');
					var milliseconds = remainingTime[1];

					$("#hours-result").html(hours);
				    $("#minutes-result").html(minutes);
				    $("#seconds-result").html(seconds);
				    $("#milli-result").html(milliseconds);

				    title = CALCULATOR.getTitle(hours,minutes,seconds);

				    if(CALCULATOR.currentTool == 1)
				    	document.title = title;

				    if (parseFloat(elapsedTime) >= parseFloat(target)) {
				        $("#hours-result").html("00");
				    	$("#minutes-result").html("00");
				        $("#seconds-result").html("00");
				    	$("#milli-result").html("000");
				    	$("#pause-button").toggleClass("hide");
				    	$("#stop-button").toggleClass("hide");
				        CALCULATOR.alarmOn = true;

				        if(!CALCULATOR.muteSound)
			        		CALCULATOR.playSound();

				        if(CALCULATOR.currentTool == 1)
				        	document.title = "Timer Expired!";

				        clearInterval(CALCULATOR.interval);
				        return;
				    }

				}, 1);
            },

            stopWatch: function(target) {
				var start = new Date().getTime();
				var elapsedTime = 0;
				var title = "";
				target = target ? target : 0;

				CALCULATOR.interval2 = setInterval(function()
				{
				    var time = new Date().getTime() - start;

				    elapsedTime = String((time/1000 + target).toFixed(3));

				    //convert seconds to hours/minutes/seconds remaining
					var hours = Math.floor((parseInt(elapsedTime) / 60 / 60));
					var minutes = Math.floor((parseInt(elapsedTime) / 60) - hours*60);
					var seconds = Math.floor(parseInt(elapsedTime) - hours * 60 * 60 - minutes * 60);

					hours = CALCULATOR.addZero(hours);
					minutes = CALCULATOR.addZero(minutes);
					seconds = CALCULATOR.addZero(seconds);

					elapsedTime = elapsedTime.split('.');
					var milliseconds = elapsedTime[1];

					$("#hours-result-2").html(hours);
				    $("#minutes-result-2").html(minutes);
				    $("#seconds-result-2").html(seconds);
				    $("#milli-result-2").html(milliseconds);

				    title = CALCULATOR.getTitle(hours,minutes,seconds);

				    if(CALCULATOR.currentTool == 2)
				    	document.title = title;
				}, 1);
            },

            alarmClock: function(target) {
				var start = new Date().getTime();
				var elapsedTime = 0;
				var title = "";

				CALCULATOR.interval3 = setInterval(function()
				{
				    var time = new Date().getTime() - start;

				    //elapsedTime = (Math.floor(time / 100) / 10); //get seconds to 3 decimal point
				    elapsedTime = (time/1000).toFixed(3);

				    //seconds remaining
				    var remainingTime = String((target - elapsedTime).toFixed(3));

				    //convert seconds to hours/minutes/seconds remaining
					var hours = Math.floor((parseInt(remainingTime) / 60 / 60));
					var minutes = Math.floor((parseInt(remainingTime) / 60) - hours*60);
					var seconds = Math.floor(parseInt(remainingTime) - hours * 60 * 60 - minutes * 60);

					hours = CALCULATOR.addZero(hours);
					minutes = CALCULATOR.addZero(minutes);
					seconds = CALCULATOR.addZero(seconds);

					remainingTime = remainingTime.split('.');
					//var milliseconds = remainingTime[1];

					$("#hours-result-alarm").html(hours);
				    $("#minutes-result-alarm").html(minutes);
				    $("#seconds-result-alarm").html(seconds);
				    //$("#milli-result-alarm").html(milliseconds);

				    title = CALCULATOR.getTitle(hours,minutes,seconds);

				    if(CALCULATOR.currentTool == 3)
				    	document.title = title;

				    if (parseFloat(elapsedTime) >= parseFloat(target)) {
				        $("#hours-result-alarm").html("00");
				    	$("#minutes-result-alarm").html("00");
				        $("#seconds-result-alarm").html("00");
				        CALCULATOR.alarmOn = true;

				        if(!CALCULATOR.muteSound)
			        		CALCULATOR.playSound(60000); //play sound for 60 seconds

				        if(CALCULATOR.currentTool == 3)
				        	document.title = "Alarm Clock Ringing!";

				        clearInterval(CALCULATOR.interval3);
				        return;
				    }

				}, 1);
            },

            defaultAlarmClock: function() {
            	var a = new Date();
				var defaultAlarmMinutes = 10;
				var b = new Date(a.getTime() + defaultAlarmMinutes*60000); //60000 milliseconds = 60 seconds = 1 minute

				var hours = b.getHours();
				if(hours > 11) {
					if(hours > 12)
						hours = hours - 12;
					$("#am-pm-alarm").val("pm");
				} else if(hours == 0) {
					hours = 12;
					$("#am-pm-alarm").val("am");
				}

				var minutes = b.getMinutes();
				var seconds = b.getSeconds();

				$("#hours-input-alarm").val(CALCULATOR.addZero(hours));
				$("#minutes-input-alarm").val(CALCULATOR.addZero(minutes));
				$("#seconds-input-alarm").val(CALCULATOR.addZero(seconds));
            },

            playSound: function(audioLength) {
            	audioLength = typeof audioLength !== 'undefined' ? audioLength : 20000; //play sound for 'audioLength' or 20 secs default
            	CALCULATOR.alarmAudio.play();
            	clearTimeout(CALCULATOR.alarmTimeOut);
            	CALCULATOR.alarmTimeOut = setTimeout(function(){
	        		CALCULATOR.alarmAudio.pause();
		        }, audioLength);
            },

            getTitle: function(h,m,s) {
            	if(parseInt(h)) {
			    	if(parseInt(m))
			    		title = h+'h '+m+'m '+s+'s';
			    	else
			    		title = h+'h '+s+'s';
			    } else if(parseInt(m)) {
			    	title = m+'m '+s+'s';
			    } else {
			    	title = s+'s';
			    }
			    return title;
            },

            addZero: function (n) {
            	return (n < 10) ? '0' + n : n;
            },

            resetValues: function () {
        		CALCULATOR.alarmOn = false;
            	CALCULATOR.alarmAudio.pause(); //stop sound
				CALCULATOR.alarmAudio.currentTime = 0;
				$("#start-button").removeClass("hide");
				$("#pause-button,#resume-button,#stop-button").addClass("hide");
				clearInterval(CALCULATOR.interval);
				$("#hours-result").html(CALCULATOR.addZero(CALCULATOR.isBlank(parseInt($("#hours-input").val()))));
				$("#minutes-result").html(CALCULATOR.addZero(CALCULATOR.isBlank(parseInt($("#minutes-input").val()))));
				$("#seconds-result").html(CALCULATOR.addZero(CALCULATOR.isBlank(parseInt($("#seconds-input").val()))));
				$("#milli-result").html("000");

				$("#hours-input").val($("#hours-result").html());
				$("#minutes-input").val($("#minutes-result").html());
				$("#seconds-input").val($("#seconds-result").html());
				
				$("#countdown-split-table").empty();
				CALCULATOR.numSplits = 1;

				document.title = "Timer | Math Easy Solutions";
            },

            resetValues2: function () {
				$("#start-button-2").removeClass("hide");
				$("#pause-button-2,#resume-button-2").addClass("hide");
				clearInterval(CALCULATOR.interval2);
				$("#hours-result-2").html("00");
				$("#minutes-result-2").html("00");
				$("#seconds-result-2").html("00");
				$("#milli-result-2").html("000");

				$("#countdown-split-table-2").empty();
				CALCULATOR.numSplits2 = 1;

				document.title = "Timer | Math Easy Solutions";
            },

            resetValues3: function () {
				CALCULATOR.alarmAudio.currentTime = 0;
				clearInterval(CALCULATOR.interval3);
            },

            iPhoneSoundReset: function () { //Because iPhones are stupid.
				CALCULATOR.playSound();
				CALCULATOR.alarmAudio.pause();
				CALCULATOR.alarmAudio.currentTime = 0;
            },

            isBlank: function(value) {
            	if(isNaN(value)) {
            		return 0;
            	}
            	return value;
            },

			isNumberKey: function(key) {
				var charCode = (key.which) ? key.which : event.keyCode;
				if (charCode != 45 && charCode != 46 && charCode != 36 && charCode > 31 && (charCode < 48 || charCode > 57))
					return false;
				return true;
			}
		}
	})();

	/*************************************************** COUNTDOWN TIMER CODE BEGINS HERE ***************************************************/
	$("#start-button").click(function() {
		$(this).toggleClass("hide");
		$("#pause-button").toggleClass("hide");
		var hours = CALCULATOR.isBlank(parseInt($("#hours-input").val()));
		var minutes = CALCULATOR.isBlank(parseInt($("#minutes-input").val()));
		var seconds = CALCULATOR.isBlank(parseInt($("#seconds-input").val()));

		$("#hours-input").val(CALCULATOR.addZero(hours));
		$("#minutes-input").val(CALCULATOR.addZero(minutes));
		$("#seconds-input").val(CALCULATOR.addZero(seconds));
		var target = hours * 3600 + minutes * 60 + seconds;
		CALCULATOR.iPhoneSoundReset();
		CALCULATOR.countDown(target);
	});

	$("#pause-button").click(function() {
		$(this).toggleClass("hide");
		$("#resume-button").toggleClass("hide");
		clearInterval(CALCULATOR.interval);
	});
	$("#resume-button").click(function() {
		$(this).toggleClass("hide");
		$("#pause-button").toggleClass("hide");
		var target = parseInt($("#hours-result").html()) * 3600 + parseInt($("#minutes-result").html()) * 60 + parseInt($("#seconds-result").html()) + parseFloat($("#milli-result").html())/1000;
		CALCULATOR.countDown(target);
	});
	$("#stop-button").click(function() {
		if(CALCULATOR.alarmOn) {
			CALCULATOR.alarmOn = false;
			CALCULATOR.alarmAudio.pause(); //stop sound
		} else {
			CALCULATOR.alarmOn = true;
			CALCULATOR.playSound();
		}	
	});
	$("#reset-button").click(function() {
		CALCULATOR.resetValues();
	});
	$("#split-button").click(function() {
		var hours = $("#hours-result").html();
		var minutes = $("#minutes-result").html();
		var seconds = $("#seconds-result").html();
		var milli = $("#milli-result").html();
		var time = hours + ':' + minutes + ':' + seconds + ' ('+milli+' ms)';
		var newRow = '<tr><td class="split__table__cell"><span class="bold">Split '+CALCULATOR.numSplits+'</span></td><td class="split__table__cell"><span>'+time+'</span></td></tr>';
		$("#countdown-split-table").append(newRow);
		CALCULATOR.numSplits++;
	});
	$("#friendly-sound-button").click(function() {
		$("#annoying-sound-button,#sound-off-button").removeClass("active-button--blue");
		$(this).addClass("active-button--blue");
		CALCULATOR.alarmAudio.src = "audio/grandfather_alarm_clock.wav";
		CALCULATOR.alarmAudio.volume = 1;
		if(CALCULATOR.alarmOn) {
			CALCULATOR.playSound();
		}
		CALCULATOR.muteSound = false;
	});
	$("#annoying-sound-button").click(function() {
		$("#friendly-sound-button,#sound-off-button").removeClass("active-button--blue");
		$(this).addClass("active-button--blue");
		CALCULATOR.alarmAudio.src = "audio/annoying_alarm_clock.wav";
		CALCULATOR.alarmAudio.volume = 1;
		if(CALCULATOR.alarmOn) {
			CALCULATOR.playSound();
		}
		CALCULATOR.muteSound = false;
	});
	$("#sound-off-button").click(function() {
		$("#friendly-sound-button,#annoying-sound-button").removeClass("active-button--blue");
		$(this).addClass("active-button--blue");
		CALCULATOR.alarmAudio.volume = 0;
		CALCULATOR.alarmAudio.pause();
		CALCULATOR.muteSound = true;
	});
	/*************************************************** COUNTDOWN TIMER CODE ENDS HERE ***************************************************/

	/*************************************************** STOPWATCH CODE BEGINS HERE ***************************************************/
	$("#start-button-2").click(function() {
		$(this).toggleClass("hide");
		$("#pause-button-2").toggleClass("hide");
		CALCULATOR.stopWatch(0);
	});
	$("#pause-button-2").click(function() {
		$(this).toggleClass("hide");
		$("#resume-button-2").toggleClass("hide");
		clearInterval(CALCULATOR.interval2);
	});
	$("#resume-button-2").click(function() {
		$(this).toggleClass("hide");
		$("#pause-button-2").toggleClass("hide");
		var target = parseInt($("#hours-result-2").html()) * 3600 + parseInt($("#minutes-result-2").html()) * 60 + parseInt($("#seconds-result-2").html()) + parseFloat($("#milli-result-2").html())/1000;
		CALCULATOR.stopWatch(target);
	});
	$("#reset-button-2").click(function() {
		CALCULATOR.resetValues2();
	});
	$("#split-button-2").click(function() {
		var hours = $("#hours-result-2").html();
		var minutes = $("#minutes-result-2").html();
		var seconds = $("#seconds-result-2").html();
		var milli = $("#milli-result-2").html();
		var time = hours + ':' + minutes + ':' + seconds + ' ('+milli+' ms)';
		var newRow = '<tr><td class="split__table__cell"><span class="bold">Split '+CALCULATOR.numSplits2+'</span></td><td class="split__table__cell"><span>'+time+'</span></td></tr>';
		$("#countdown-split-table-2").append(newRow);
		CALCULATOR.numSplits2++;
	});
	/*************************************************** STOPWATCH CODE ENDS HERE ***************************************************/
	/*************************************************** ALARM CLOCK CODE BEGINS HERE ***************************************************/
	$("#start-button-alarm").click(function() {

		var hoursTarget = CALCULATOR.isBlank(parseInt($("#hours-input-alarm").val()));
		var minutesTarget = CALCULATOR.isBlank(parseInt($("#minutes-input-alarm").val()));
		var secondsTarget = CALCULATOR.isBlank(parseInt($("#seconds-input-alarm").val()));

		if($("#am-pm-alarm").val() == "am") {
			if(hoursTarget < 1 || hoursTarget > 12) {
				alert("Hour hand must be between 1 and 12. Otherwise, use the 24 hour clock from the drop-down menu.");
				return;
			}
			if(hoursTarget == 12) //12am = 0 hours
				hoursTarget = 0;
		} else if($("#am-pm-alarm").val() == "pm") {
			if(hoursTarget < 1 || hoursTarget > 12) {
				alert("Hour hand must be between 1 and 12. Otherwise, use the 24 hour clock from the drop-down menu.");
				return;
			}
			if(hoursTarget != 12) //12pm = 12 hours
				hoursTarget = hoursTarget + 12;
		} else {
			if(hoursTarget < 0 || hoursTarget > 23) {
				alert("Hour hand must be between 0 and 23.");
				return;
			}
		}

		if(minutesTarget < 0 || minutesTarget > 59 || secondsTarget < 0 || secondsTarget > 59) {
			alert("Minute hand must be between 0 and 59.")
			return;
		}

		var d = new Date();
		var hoursCurrent = d.getHours();
		var minutesCurrent = d.getMinutes();
		var secondsCurrent = d.getSeconds();

		var totalSecondsCurrent = hoursCurrent * 3600 + minutesCurrent * 60 + secondsCurrent;
		var totalSecondsTarget = hoursTarget * 3600 + minutesTarget * 60 + secondsTarget;

		var secondsDifference = totalSecondsTarget - totalSecondsCurrent;

		secondsDifference = (secondsDifference < 0) ? 86400 + secondsDifference : secondsDifference;

		/*$("#hours-input-alarm").val(CALCULATOR.addZero(hoursTarget));
		$("#minutes-input-alarm").val(CALCULATOR.addZero(minutesTarget));
		$("#seconds-input-alarm").val(CALCULATOR.addZero(secondsTarget));*/

		CALCULATOR.iPhoneSoundReset();
		CALCULATOR.resetValues3();
		CALCULATOR.alarmClock(secondsDifference);

		$(this).toggleClass("hide");
		$("#stop-button-alarm").toggleClass("hide");
		
	});

	$("#stop-button-alarm").click(function() {
		CALCULATOR.alarmOn = false;
		CALCULATOR.alarmAudio.pause(); //stop sound
		CALCULATOR.resetValues3();
		$(this).toggleClass("hide");
		$("#start-button-alarm").toggleClass("hide");
	});

	$("#friendly-sound-button-alarm").click(function() {
		$("#annoying-sound-button-alarm,#sound-off-button-alarm").removeClass("active-button--blue");
		$(this).addClass("active-button--blue");
		CALCULATOR.alarmAudio.src = "audio/grandfather_alarm_clock.wav";
		CALCULATOR.alarmAudio.volume = 1;
		if(CALCULATOR.alarmOn) {
			CALCULATOR.playSound(60000);
		}
		CALCULATOR.muteSound = false;
	});
	$("#annoying-sound-button-alarm").click(function() {
		$("#friendly-sound-button-alarm,#sound-off-button-alarm").removeClass("active-button--blue");
		$(this).addClass("active-button--blue");
		CALCULATOR.alarmAudio.src = "audio/annoying_alarm_clock.wav";
		CALCULATOR.alarmAudio.volume = 1;
		if(CALCULATOR.alarmOn) {
			CALCULATOR.playSound(60000);
		}
		CALCULATOR.muteSound = false;
	});
	$("#sound-off-button-alarm").click(function() {
		$("#friendly-sound-button-alarm,#annoying-sound-button-alarm").removeClass("active-button--blue");
		$(this).addClass("active-button--blue");
		CALCULATOR.alarmAudio.volume = 0;
		CALCULATOR.alarmAudio.pause();
		CALCULATOR.muteSound = true;
	});
	/*************************************************** ALARM CLOCK CODE BEGINS HERE ***************************************************/

    /*$(".hide-div-button").click(function() {
		$(this).next().toggleClass("hide");
		$(this).toggleClass("selected");
	});*/

	$(".button--browser").click(function() {
		if($(this).hasClass("selected--gray")) {
			$(this).removeClass("selected--gray");
			CALCULATOR.currentTool = 0;
			document.title = "Timer | Math Easy Solutions";
		} else {
			$(".button--browser").removeClass("selected--gray");
			$(this).addClass("selected--gray");
			CALCULATOR.currentTool = $(this).index(".button--browser")+1; //get index of current tool
			document.title = "Timer | Math Easy Solutions";
		}
	});

	CALCULATOR.alarmAudio.addEventListener('ended', function() {
		this.currentTime = 0;
		this.play();
	}, false);

	CALCULATOR.defaultAlarmClock();

});