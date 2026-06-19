<?php

$userid = "1366310362";
$clientId = "63a6b6aed2ad49859689202d6a9dadf1";

function fetchDataUsingCurl($url){
     $ch = curl_init();
     curl_setopt($ch, CURLOPT_URL, $url);
     curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
     curl_setopt($ch, CURLOPT_TIMEOUT, 20);
     $result = curl_exec($ch);

     if(curl_errno($ch)) {
        curl_close($ch); 
        $result = file_get_contents($url);
     } else {
        curl_close($ch);
     }
     return $result;
}

function removeEmoji($text) {
    $clean_text = "";

    // Match Emoticons
    $regexEmoticons = '/[\x{1F600}-\x{1F64F}]/u';
    $clean_text = preg_replace($regexEmoticons, '', $text);

    // Match Miscellaneous Symbols and Pictographs
    $regexSymbols = '/[\x{1F300}-\x{1F5FF}]/u';
    $clean_text = preg_replace($regexSymbols, '', $clean_text);

    // Match Transport And Map Symbols
    $regexTransport = '/[\x{1F680}-\x{1F6FF}]/u';
    $clean_text = preg_replace($regexTransport, '', $clean_text);

    // Match Miscellaneous Symbols
    $regexMisc = '/[\x{2600}-\x{26FF}]/u';
    $clean_text = preg_replace($regexMisc, '', $clean_text);

    // Match Dingbats
    $regexDingbats = '/[\x{2700}-\x{27BF}]/u';
    $clean_text = preg_replace($regexDingbats, '', $clean_text);

    return $clean_text;
}

function get_img_data ($d) {
    $c = $d["caption"]["text"];
    $imgAlt = removeEmoji($c);
    $imgLink = $d["link"];
    $imgLink = explode("/",$imgLink);
    $imgLink = "https://bmicalculator.mes.fm/social-media/instagram/".$imgLink[4];
    $imgSrc = $d["images"]["standard_resolution"]["url"];
    return array('alt'=>$imgAlt, 'link'=>$imgLink, 'src'=>$imgSrc);
}

function get_single_img_data ($id,$result,$result_img) {

    $text = $result["title"];
    $imgAlt = removeEmoji($text);

    $imgSrc = 'https://bmicalculator.mes.fm/img/instagram/'.$id.'.jpg';

    $file_headers = @get_headers($imgSrc);
    if($file_headers[0] == 'HTTP/1.1 404 Not Found') {
        $instagramImgSrc = $result_img["media_url"];
        $imgDestination = 'img/instagram/'.$id.'.jpg';
        file_put_contents($imgDestination, file_get_contents($instagramImgSrc));
    }

    //$currentUrl = "https://bmicalculator.mes.fm/social-media/instagram/".$id;
    $instagramUrl = "https://instagram.com/p/".$id;

    $stuff = $result["html"];
    $stuff = explode("datetime",$stuff);
    $stuff = explode("\"", $stuff[1]);
    $stuff = explode("T", $stuff[1]);
    $datetime = $stuff[0];
    $date = date("M d, Y", strtotime($datetime));

    return array('alt'=>$imgAlt, 'src'=>$imgSrc, 'date'=>$date, 'insta_url' => $instagramUrl);
}

function get_title ($result) {
    $text = $result["title"];
    $title = removeEmoji($text);
    return $title;
}

function get_page_title($result) {
    $text = $result["title"];
    $imgAlt = removeEmoji($text);
    $titleText = preg_replace('/(^|\s)#(\w*[a-zA-Z_]+\w*)/', '\1<a href="search-results?cx=partner-pub-1461238060884369%3A9949396714&cof=FORID%3A10&ie=UTF-8&q=\2&sa=Search&siteurl=bmicalculator.mes.fm%2Fsocial-media%2Finstagram%2Fui1TaAha2U&ref=bmicalculator.mes.fm%2Fsocial-media%2Finstagram%2F&ss=543j68071j6">#\2</a>', $imgAlt);
    $titleText = preg_replace('/(^|\s)@(\w*[a-zA-Z_]+\w*)/', '\1<a href="https://instagram.com/\2" target="_blank">@\2</a>', $titleText);
    return $titleText;
}

?>