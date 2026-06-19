<?php
class Global_Variables_Extension extends \Twig_Extension
{

    public function __construct($localhost,$mobile,$uri) 
    {
        $this->localhost = $localhost;
        $this->mobile = $mobile;
        $this->uri = rtrim($uri, '/');
        $this->base = $mobile ? 'base_mobile.twig' : 'base.twig';
        $this->root_domain = $localhost ? "" : "https://vatcalculator.mes.fm/";
    }

    public function getGlobals()
    {
        return array(
            'localhost' => $this->localhost,
            'root_domain' => $this->root_domain,
            'mobile' => $this->mobile,
            'base' => $this->base,
            'url' => 'https://vatcalculator.mes.fm'.$this->uri,
            'local_root' => 'vat',
            'tag_manager' => 'GTM-NNBKCQJ',
            'calc_name' => 'VAT Calculator',
            'dark_color' => '#dbbd3d',
            'light_color' => '#fef9e3',
            'highlight_color' => '#c0ad27',
            'fb_id' => '528220573953277',
            'og_type' => 'website',
            'og_title' => 'VAT Calculator by Math Easy Solutions',
            'og_description' => 'Use this VAT calculator to calculate value added tax from a net value at a specific VAT rate!',
            'ga_id' => 'UA-18189318-10',
            'url_short' => 'vatcalculator.mes.fm',
            'policy_date_modified' => 'Oct 8, 2014',
            'tag_line' => 'Calculate VAT (Value Added Tax)',
            'addthis_id' => 'ra-53b7585d09d9e0bd',
            'show_ads' => $this->localhost ? false : true,
            'show_articles' => false,
            'carambo_ad' => true,
            'carambo_ad_name' => false,
            'carambo_ad_300_600' => 'div-gpt-ad-1431670289742-0',
            'carambo_ad_name_300_600' => 'VAT_300x600',
            'contact_email' => 'vat@mes.fm',
            'disqus_url' => 'vatmes',
            'resp_rect' => true,
            'resp_vert_mobile' => true,
            'subscribe_data' => array(
                'url' => 'https://vatcalculator.us13.list-manage1.com/subscribe?u=dbcd5a985e8f82625fa9deab8&id=486f7fb657',
                'form' => '//vatcalculator.us13.list-manage.com/subscribe/post?u=dbcd5a985e8f82625fa9deab8&amp;id=486f7fb657',
                'id' => '486f7fb657'
                ),
            'ad_id' => array(
                'anchor' => '4382243664',
                'resp_horiz' => '1998573269',
                'resp_rect' => '7523729669',
                'resp_vert' => '6788699662',
                '728x90' => '7613582068',
                '300x600' => '4242642868',
                '336x280' => '7335710065',
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
                'fb' => 'VATCalculatorMES',
                'twitter' => 'vat_calculator',
                'gplus' => '+VATCalculatorCoPage',
                ),
            'navbar' => array(
                ),
            'navbar_mobile' => array(
                )
        );
    }

    public function getName()
    {
        return 'Global_Variables_Extension';
    }
}
?>