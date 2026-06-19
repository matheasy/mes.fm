<?php
class Global_Variables_Extension extends \Twig_Extension
{

    public function __construct($localhost,$mobile,$uri) 
    {
        $this->localhost = $localhost;
        $this->mobile = $mobile;
        $this->uri = rtrim($uri, '/');
        $this->base = $mobile ? 'base_mobile.twig' : 'base.twig';
        $this->root_domain = $localhost ? "" : "https://mortgagecalculator.mes.fm/";
    }

    public function getGlobals()
    {
        return array(
            'localhost' => $this->localhost,
            'root_domain' => $this->root_domain,
            'mobile' => $this->mobile,
            'base' => $this->base,
            'url' => 'https://mortgagecalculator.mes.fm'.$this->uri,
            'local_root' => 'mortgage',
            'tag_manager' => 'GTM-P4K68GB',
            'calc_name' => 'Mortgage Calculator',
            'dark_color' => '#1b6e34',
            'light_color' => '#e4efd3',
            'highlight_color' => '#155528',
            'fb_id' => '140325329632380',
            'og_type' => 'website',
            'og_title' => 'Mortgage Calculator by Math Easy Solutions',
            'og_description' => 'This mortgage calculator calculates your monthly mortgage payment and taxes.',
            'ga_id' => 'UA-18189318-15',
            'url_short' => 'mortgagecalculator.mes.fm',
            'policy_date_modified' => 'Oct 8, 2014',
            'tag_line' => 'Calculate your Monthly Mortgage Payment',
            'memes_dir' => 'dream-homes',
            'addthis_id' => 'ra-55a0275ca300c3cf',
            'show_ads' => $this->localhost ? false : true,
            'show_articles' => false,
            'carambo_ad' => 'div-gpt-ad-1436756848347-0',
            'carambo_ad_name' => 'MC_728x350_Carambola',
            'dfp_ad_name' => 'MC',
            'contact_email' => 'mc@mes.fm',
            'disqus_url' => 'mortgagemes',
            'just_answer' => true,
            'resp_vert_mobile' => true,
            'google_play_link' => 'https://play.google.com/store/apps/details?id=com.mike.mortgageCalculator',
            'subscribe_data' => array(
                'url' => 'https://mes.us13.list-manage.com/subscribe?u=dbcd5a985e8f82625fa9deab8&id=631c5b90dc',
                'form' => '//mes.us13.list-manage.com/subscribe/post?u=dbcd5a985e8f82625fa9deab8&amp;id=631c5b90dc',
                'id' => '631c5b90dc'
                ),
            'ad_id' => array(
                'resp_horiz' => '5810769267',
                'resp_rect' => '7507828466',
                'resp_vert' => '1321694061',
                'link1' => '2460350064', // 200x90 #1
                'link2' => '6750948869', // 200x90 #2
                'link3' => '5553417266', // 728x15
                'anchor' => '3152217267',
                'm_link3' => '8088081264',
                'dfp_300_250' => 'div-gpt-ad-1441218240888-0'
                ),
            'social_medias' => array(
                'fb' => 'mortgagemes',
                'twitter' => 'mortgagemes',
                'insta' => 'mortgagemes',
                'gplus' => '102904645385726760971',
                'pin' => 'mortgagemes'
                ),
            'navbar' => array(
                array(
                    'url'=>$this->root_domain.'dream-homes',
                    'label'=>'Dream Homes'
                    ),
                array(
                    'url'=>$this->root_domain.'formulas',
                    'label'=>'Formulas',
                    'dropdown'=> array(
                        array(
                            'url'=>$this->root_domain.'amortization-formula',
                            'label'=>'Mortgage Amortization Formula',
                            ),
                        array(
                            'url'=>$this->root_domain.'balloon-payment-formula',
                            'label'=>'Mortgage Amortization Formula (with Balloon Payment)',
                            ),
                        array(
                            'url'=>$this->root_domain.'amortization-formula-proof',
                            'label'=>'Amortization Formula Proof',
                            ),
                        array(
                            'url'=>$this->root_domain.'formulas/',
                            'label'=>'More...',
                            )
                        ),
                    ),
                array(
                    'url'=>$this->root_domain.'mortgage-definition',
                    'label'=>'What is Mortgage?'
                    ),
                array(
                    'url'=>$this->root_domain.'financial-advice/how-to-get-accepted-for-a-mortgage',
                    'label'=>'Mortgage Acceptance'
                    ),
                array(
                    'url'=>$this->root_domain.'tutorial',
                    'label'=>'Tutorial'
                    )
                ),
            'navbar_mobile' => array(
            	array(
                    'url'=>'https://play.google.com/store/apps/details?id=com.mike.mortgageCalculator',
                    'label'=>'Android App',
                    'link_window' => '_blank'
                    ),
                array(
                    'url'=>$this->root_domain.'dream-homes',
                    'label'=>'Dream Homes'
                    ),
                array(
                    'url'=>$this->root_domain.'formulas',
                    'label'=>'Formulas'
                    ),
                array(
                    'url'=>$this->root_domain.'mortgage-definition',
                    'label'=>'What is Mortgage?'
                    ),
                array(
                    'url'=>$this->root_domain.'tutorial',
                    'label'=>'Tutorial'
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