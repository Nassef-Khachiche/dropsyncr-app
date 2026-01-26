import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { 
  Sparkles,
  Plus,
  Lightbulb,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Info,
  Wand2,
  Copy,
  Download,
  Type,
  FileText
} from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { Slider } from './ui/slider';
import { Alert, AlertDescription } from './ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

interface AIListingBuilderProps {
  activeProfile: string;
}

interface QualityCheck {
  label: string;
  passed: boolean;
  required: boolean;
}

export function AIListingBuilder({ activeProfile }: AIListingBuilderProps) {
  const [productName, setProductName] = useState('');
  const [brand, setBrand] = useState('');
  const [targetGroup, setTargetGroup] = useState('');
  const [toneOfVoice, setToneOfVoice] = useState('zakelijk');
  const [productDetails, setProductDetails] = useState('');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState('');
  const [keywordIntensity, setKeywordIntensity] = useState([50]);
  const [generatedTitle, setGeneratedTitle] = useState('');
  const [generatedDescription, setGeneratedDescription] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const qualityChecks: QualityCheck[] = [
    { label: 'Titel bevat maximaal 70 karakters', passed: generatedTitle.length > 0 && generatedTitle.length <= 70, required: true },
    { label: 'Bevat minimaal drie zoekwoorden', passed: keywords.length >= 3, required: true },
    { label: 'Bevat minimaal 3 alineas', passed: generatedDescription.split('\n\n').length >= 3, required: true },
    { label: 'Elke zin begint met een hoofdletter', passed: true, required: false },
    { label: 'Geen woorden volledig in hoofdletters', passed: true, required: false },
    { label: 'Geen emojis of smileys', passed: true, required: false },
    { label: 'Geen gebruik van verboden termen', passed: true, required: false },
    { label: 'Bevat diegedruke woorden', passed: false, required: false },
    { label: 'Bevat kopjes (header 3)', passed: false, required: false },
  ];

  const calculateQualityScore = () => {
    const passedChecks = qualityChecks.filter(check => check.passed).length;
    return ((passedChecks / qualityChecks.length) * 10).toFixed(1);
  };

  const handleAddKeyword = () => {
    if (keywordInput.trim() && !keywords.includes(keywordInput.trim())) {
      setKeywords([...keywords, keywordInput.trim()]);
      setKeywordInput('');
      toast.success('Zoekwoord toegevoegd');
    }
  };

  const handleRemoveKeyword = (keyword: string) => {
    setKeywords(keywords.filter(k => k !== keyword));
    toast.success('Zoekwoord verwijderd');
  };

  const handleSuggestKeywords = () => {
    // Mock suggestions based on product name
    const suggestions = ['hardloopschoenen', 'sportschoenen', 'running', 'fitness', 'outdoor'];
    const newKeywords = suggestions.filter(s => !keywords.includes(s)).slice(0, 3);
    setKeywords([...keywords, ...newKeywords]);
    toast.success(`${newKeywords.length} zoekwoorden toegevoegd`);
  };

  const handleGenerateContent = async () => {
    if (!productName.trim()) {
      toast.error('Vul een productnaam in');
      return;
    }

    if (keywords.length < 3) {
      toast.warning('Minimaal 3 zoekwoorden aanbevolen voor optimale resultaten');
    }

    setIsGenerating(true);

    // Simulate AI generation
    setTimeout(() => {
      // Generate title
      const keywordsString = keywords.slice(0, 3).join(' | ');
      setGeneratedTitle(`${productName}${keywordsString ? ' - ' + keywordsString : ''}`);

      // Generate description
      const description = `${productName} - De perfecte keuze voor ${targetGroup || 'jou'}

Met ${productName} maak je een uitstekende keuze. ${productDetails || 'Dit hoogwaardige product biedt uitstekende prestaties en duurzaamheid.'}

**Belangrijkste kenmerken:**
• Hoogwaardige materialen en afwerking
• Geschikt voor ${targetGroup || 'diverse toepassingen'}
• ${keywords.slice(0, 3).join(', ')}

**Specificaties:**
${productDetails || 'Uitgebreide productinformatie beschikbaar op aanvraag.'}

**Over ${brand || 'dit merk'}:**
${brand ? `${brand} staat bekend om kwaliteit en innovatie. ` : ''}Met jarenlange ervaring in de sector leveren wij producten waar je op kunt vertrouwen.

Bestel nu en profiteer van snelle levering en uitstekende service!`;

      setGeneratedDescription(description);
      setIsGenerating(false);
      toast.success('Content succesvol gegenereerd!');
    }, 2000);
  };

  const handleCopyTitle = () => {
    navigator.clipboard.writeText(generatedTitle);
    toast.success('Titel gekopieerd naar klembord');
  };

  const handleCopyDescription = () => {
    navigator.clipboard.writeText(generatedDescription);
    toast.success('Beschrijving gekopieerd naar klembord');
  };

  const handleExport = () => {
    const content = `PRODUCTTITEL:\n${generatedTitle}\n\nPRODUCTBESCHRIJVING:\n${generatedDescription}\n\nZOEKWOORDEN:\n${keywords.join(', ')}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `listing-${productName.replace(/\s+/g, '-').toLowerCase()}.txt`;
    a.click();
    toast.success('Content geëxporteerd');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2">
            AI Listing Builder
          </h2>
          <p className="text-slate-600">Genereer perfecte titels & productbeschrijvingen met AI</p>
        </div>
        <Badge className="bg-gradient-to-r from-purple-500 to-pink-500 border-0 gap-1">
          <Sparkles className="w-3 h-3" />
          BETA
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Sidebar - Keywords & Quality */}
        <div className="lg:col-span-4 space-y-6">
          {/* Keywords Section */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Zoekwoorden</CardTitle>
              <CardDescription>
                Voer hier belangrijke zoekwoorden in. Naast elk zoekwoord staat het zoekvolume.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Keyword Input */}
              <div className="flex gap-2">
                <Input
                  placeholder="bijv. hardloopschoenen"
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddKeyword()}
                  className="border-slate-200"
                />
                <Button 
                  size="sm" 
                  onClick={handleAddKeyword}
                  className="bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleSuggestKeywords}
                className="w-full gap-2 border-slate-200"
              >
                <Lightbulb className="w-4 h-4" />
                Suggestie
              </Button>

              {/* Keywords Display */}
              {keywords.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {keywords.map((keyword, idx) => (
                    <Badge 
                      key={idx}
                      variant="outline"
                      className="border-indigo-300 bg-indigo-50 text-indigo-700 gap-2 cursor-pointer hover:bg-indigo-100"
                      onClick={() => handleRemoveKeyword(keyword)}
                    >
                      {keyword}
                      <XCircle className="w-3 h-3" />
                    </Badge>
                  ))}
                </div>
              )}

              {/* Keyword Intensity Slider */}
              <div className="space-y-3 pt-2">
                <Label className="text-sm">Gebruik zoekwoorden</Label>
                <div className="relative">
                  <div className="h-2 rounded-full bg-gradient-to-r from-blue-500 via-emerald-500 via-yellow-500 to-red-500" />
                  <Slider
                    value={keywordIntensity}
                    onValueChange={setKeywordIntensity}
                    max={100}
                    step={1}
                    className="absolute top-0 left-0 w-full"
                  />
                </div>
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Min</span>
                  <span>Max</span>
                </div>
              </div>

              <Alert className="border-indigo-200 bg-indigo-50/50">
                <Info className="h-4 w-4 text-indigo-600" />
                <AlertDescription className="text-xs text-indigo-900">
                  Tip: kies minimaal drie zoekwoorden die samen een zoekvolume van 100 of meer hebben.{' '}
                  <button className="underline">Lees meer</button>
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          {/* Content Quality Section */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Content kwaliteit</CardTitle>
              <CardDescription>
                Controleer je content op belangrijke punten voor het Bol.com algoritme
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Quality Score */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-600 mb-1">Kwaliteitsscore</p>
                  <p className="text-3xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                    {calculateQualityScore()}
                  </p>
                  <p className="text-xs text-slate-500">/10</p>
                </div>
                <div>
                  <p className="text-xs text-slate-600 mb-1">Benut zoekvolume</p>
                  <p className="text-3xl bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                    0
                  </p>
                  <p className="text-xs text-slate-500">/0</p>
                </div>
              </div>

              {/* Quality Checklist */}
              <div className="space-y-2 pt-2">
                {qualityChecks.map((check, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-sm">
                    {check.passed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                    )}
                    <span className={check.passed ? 'text-slate-700' : 'text-slate-500'}>
                      {check.label}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Area */}
        <div className="lg:col-span-8 space-y-6">
          {/* AI Generator Card */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Wand2 className="w-5 h-5 text-indigo-600" />
                <CardTitle>AI generator</CardTitle>
              </div>
              <CardDescription>
                Genereer perfecte titels & productbeschrijvingen met AI
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Product Name */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="productName">
                    Productnaam* <span className="text-xs text-indigo-600">(Merk*)</span>
                  </Label>
                  <Input
                    id="productName"
                    placeholder="Free Run 5.0 Hardloopschoenen"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    className="border-slate-200"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="brand">Merk*</Label>
                  <Input
                    id="brand"
                    placeholder="Nike"
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    className="border-slate-200"
                  />
                </div>
              </div>

              {/* Target Group & Tone */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="targetGroup">Doelgroep</Label>
                  <Input
                    id="targetGroup"
                    placeholder="Recreatieve hardlopers"
                    value={targetGroup}
                    onChange={(e) => setTargetGroup(e.target.value)}
                    className="border-slate-200"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="toneOfVoice">Tone of voice</Label>
                  <Select value={toneOfVoice} onValueChange={setToneOfVoice}>
                    <SelectTrigger id="toneOfVoice" className="border-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="zakelijk">Zakelijk</SelectItem>
                      <SelectItem value="casual">Casual</SelectItem>
                      <SelectItem value="enthousiast">Enthousiast</SelectItem>
                      <SelectItem value="luxe">Luxe</SelectItem>
                      <SelectItem value="jeugdig">Jeugdig</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Product Details */}
              <div className="space-y-2">
                <Label htmlFor="productDetails">Productdetails</Label>
                <Textarea
                  id="productDetails"
                  placeholder="Geproduceerd met gerecycled materiaal, zachter schuim dan andere hardloopschoenen en gemaakt van ademend materiaal"
                  value={productDetails}
                  onChange={(e) => setProductDetails(e.target.value)}
                  rows={4}
                  className="border-slate-200 resize-none"
                />
              </div>

              {/* Warning */}
              {keywords.length < 3 && (
                <Alert className="border-orange-200 bg-orange-50/50">
                  <AlertCircle className="h-4 w-4 text-orange-600" />
                  <AlertDescription className="text-sm text-orange-900">
                    Nog geen zoekwoorden toegevoegd. Het toevoegen van zoekwoorden zal je gegenereerde content aanzienlijk verbeteren. 
                    We raden aan om minimaal 3 zoekwoorden toe te voegen.
                  </AlertDescription>
                </Alert>
              )}

              {/* Generate Button */}
              <Button
                onClick={handleGenerateContent}
                disabled={isGenerating}
                className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 gap-2"
                size="lg"
              >
                {isGenerating ? (
                  <>
                    <Sparkles className="w-5 h-5 animate-spin" />
                    Content wordt gegenereerd...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Genereer content
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Generated Content */}
          {(generatedTitle || generatedDescription) && (
            <>
              {/* Actions */}
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExport}
                  className="gap-2 border-slate-200"
                >
                  <Download className="w-4 h-4" />
                  Exporteer
                </Button>
              </div>

              <Tabs defaultValue="title" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="title" className="gap-2">
                    <Type className="w-4 h-4" />
                    Producttitel
                  </TabsTrigger>
                  <TabsTrigger value="description" className="gap-2">
                    <FileText className="w-4 h-4" />
                    Productbeschrijving
                  </TabsTrigger>
                </TabsList>

                {/* Product Title */}
                <TabsContent value="title" className="mt-4">
                  <Card className="border-slate-200 shadow-sm">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">Producttitel</CardTitle>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleCopyTitle}
                            className="gap-2 border-slate-200"
                          >
                            <Copy className="w-4 h-4" />
                            Kopieer
                          </Button>
                          <Badge variant="outline" className="border-slate-300">
                            {generatedTitle.length} / 70 karakters
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Textarea
                        value={generatedTitle}
                        onChange={(e) => setGeneratedTitle(e.target.value)}
                        rows={3}
                        className="border-slate-200 resize-none"
                      />
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Product Description */}
                <TabsContent value="description" className="mt-4">
                  <Card className="border-slate-200 shadow-sm">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">Productbeschrijving</CardTitle>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleCopyDescription}
                          className="gap-2 border-slate-200"
                        >
                          <Copy className="w-4 h-4" />
                          Kopieer
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Textarea
                        value={generatedDescription}
                        onChange={(e) => setGeneratedDescription(e.target.value)}
                        rows={16}
                        className="border-slate-200 resize-none font-mono text-sm"
                      />
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </>
          )}

          {/* Info Card */}
          <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50 to-purple-50/50">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl shadow-lg">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h4 className="text-slate-900 mb-2">Over AI Listing Builder</h4>
                  <p className="text-sm text-slate-700 mb-3">
                    Onze AI-technologie genereert geoptimaliseerde productbeschrijvingen die voldoen aan de richtlijnen 
                    van Bol.com, Amazon en andere marketplaces. Door gebruik te maken van zoekwoorden met hoog zoekvolume 
                    en SEO-technieken, verhoog je de vindbaarheid van je producten en boost je je conversie.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="border-indigo-300 text-indigo-700 bg-white">
                      SEO geoptimaliseerd
                    </Badge>
                    <Badge variant="outline" className="border-purple-300 text-purple-700 bg-white">
                      Marketplace ready
                    </Badge>
                    <Badge variant="outline" className="border-pink-300 text-pink-700 bg-white">
                      Kwaliteit check
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
