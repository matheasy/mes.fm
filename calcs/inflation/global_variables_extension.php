<?php
class Global_Variables_Extension extends \Twig_Extension
{

    public function __construct($localhost,$mobile,$uri) 
    {
        $this->localhost = $localhost;
        $this->mobile = $mobile;
        $this->uri = rtrim($uri, '/');
        $this->base = $mobile ? 'base_mobile.twig' : 'base.twig';
        $this->root_domain = $localhost ? "" : "https://inflationcalculator.mes.fm/";
    }

    public function getGlobals()
    {
        return array(
            'localhost' => $this->localhost,
            'root_domain' => $this->root_domain,
            'mobile' => $this->mobile,
            'base' => $this->base,
            'url' => 'https://inflationcalculator.mes.fm'.$this->uri,
            'local_root' => 'inflation',
            'tag_manager' => 'GTM-NV2HK8C',
            'calc_name' => 'Inflation Calculator',
            'dark_color' => '#f0572e',
            'light_color' => '#fbd1c8',
            'highlight_color' => '#d54716',
            'fb_id' => '610980252344789',
            'og_type' => 'website',
            'og_title' => 'Inflation Calculator by Math Easy Solutions',
            'og_description' => 'This Inflation Calculator calculates a country\'s inflation rate within two different years.',
            'ga_id' => 'UA-18189318-12',
            'url_short' => 'inflationcalculator.mes.fm',
            'policy_date_modified' => 'Oct 8, 2014',
            'tag_line' => 'The one stop for Inflation Rates and all things Economics',
            'addthis_id' => 'ra-53b7585d09d9e0bd',
            'show_ads' => $this->localhost ? false : true,
            'show_articles' => false,
            'carambo_ad' => true,
            'carambo_ad_name' => false,
            'carambo_ad_300_600' => 'div-gpt-ad-1431671520285-0',
            'carambo_ad_name_300_600' => 'IC_300x600',
            'contact_email' => 'ic@mes.fm',
            'disqus_url' => 'inflationmes',
            'subscribe_data' => array(
                'url' => 'https://inflation-calculator.us13.list-manage2.com/subscribe?u=dbcd5a985e8f82625fa9deab8&id=59d6f8b496',
                'form' => '//cdn-images.mailchimp.com/embedcode/slim-10_7.css" rel="stylesheet',
                'id' => '59d6f8b496'
                ),
            'resp_rect' => true,
            'resp_vert_mobile' => true,
            'ad_id' => array(
                'anchor' => '5426373262',
                'resp_horiz' => '6707974460',
                'resp_rect' => '9279664466',
                'resp_vert' => '8544634463',
                '728x90' => '7639253669',
                '300x600' => '1040990062',
                '336x280' => '2657324061',
                'link1' => '8990839391', //gpa
                'link2' => '4928448742', //gpa
                'link3' => '3463913664', //gpa
                'm_anchor' => '',
                'm_320x100' => '5007002064', //gpa
                'm_300x250' => '6983262862', //gpa
                'm_300x250_2' => '2706010460', //gpa
                'm_link1' => '6996609269', //gpa
                'm_link2' => '2287208066', //gpa
                'm_link3' => '6717407666' //gpa
                ),
            'social_medias' => array(
                'fb' => 'InflationCalculator',
                'twitter' => 'Inflation_Calc',
                'gplus' => '+InflationCalculatorPage',
                'pin' => 'inflationmes'
                ),
            'navbar' => array(
                array(
                    'url'=>$this->root_domain.'money-facts',
                    'label'=>'Money Facts'
                    )
                ),
            'navbar_mobile' => array(
                array(
                    'url'=>$this->root_domain.'money-facts',
                    'label'=>'Money Facts'
                    )
                )
        );
    }

    public function getName()
    {
        return 'Global_Variables_Extension';
    }
}
?>