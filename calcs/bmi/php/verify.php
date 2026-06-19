<?php
    //require_once('lib/recaptchalib.php');
    //print_r($_POST);
    //print_r(array_filter($_POST));

    $user_info = array_filter($_POST);
    $user_info = array_reverse($user_info);

    $privatekey = "6LeNGgMTAAAAAE82s4yFsLnO8-wCRD1qW1CVPowm";
    $response = $_POST['g-recaptcha-response'];
    $ip = $_SERVER["REMOTE_ADDR"];

    $url = 'https://www.google.com/recaptcha/api/siteverify';
    $full_url = $url.'?secret='.$privatekey.'&response='.$response.'&remoteip='.$ip;

    $data = json_decode(file_get_contents($full_url));
    if(isset($data->success) && $data->success == true) {
        $pass = true;
        echo "PASS";
    } else {
        $pass = false;
        echo "FAIL";
    }

    if($pass) {
        unset($user_info["email2"]);
        unset($user_info["recaptcha_challenge_field"]);
        unset($user_info["recaptcha_response_field"]);
        unset($user_info["g-recaptcha-response"]);

        if($user_info["consultation_id"] != 2)
            unset($user_info["cell-phone-use-per-day-hours"]);

        if($user_info["consultation_id"] == 1 || $user_info["consultation_id"] == 2)
            unset($user_info["skype-length"]);

        unset($user_info["consultation_id"]);
        
        $body_message = "";
        foreach ($user_info as $key => $value) {
          $body_message = "$key: $value\n".$body_message;
        }

        $to      = 'bmi@mes.fm';
        $subject = 'BMI Consultation';
        $message = $body_message;
        //$message = wordwrap($message, 100, "\r\n");
        $headers = 'From: bmi@mes.fm';
        //$headers = 'From: bmicalculator.mes.fm' . "\r\n" .
        //    'Reply-To: admin@mes.fm';
        mail($to, $subject, $message, $headers);
    }
  

  ?>